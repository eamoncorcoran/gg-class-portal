# The classroom: a teacher makes classes, students join with a code, the teacher assigns exams and
# quizzes, students sit them in the app and the results come back here. One SQLite file, no accounts
# beyond a random token kept in each browser (a teacher's for their classes, a student's for their
# place in a class). Served by pq/server.py under /api/. Unused by the hub front end today, kept working.
#
#   POST /api/teacher            {name}                      -> teacher {token, id, name}
#   GET  /api/teacher?t=         -> {id, name, classes: [{id, name, code, students, assignments}]}
#   POST /api/classes            {t, name}                   -> class
#   POST /api/classes/delete     {t, id}
#   GET  /api/classes/<id>?t=    -> {class, students, assignments (with done/total counts)}
#   POST /api/students/remove    {t, id}
#   POST /api/assignments        {t, classId, kind, title, payload, due}   kind = exam | quiz
#   POST /api/assignments/delete {t, id}
#   GET  /api/assignments/<id>?t= -> {assignment, class, students: [{..., submission}]}
#   POST /api/join               {code, name}                -> {token, student, class}
#   GET  /api/student?s=         -> {student, class, assignments: [{..., mine}]}
#   GET  /api/assignments/<id>/sit?s= -> {assignment}
#   POST /api/submit             {s, assignmentId, answers, results, got, total, done}
import json
import os
import secrets
import sqlite3
import string
import time

STATE_DIR = os.environ.get('STATE_DIR') or '/var/data/state'   # the one writable place on Render (the disk)
DB = os.path.join(STATE_DIR, 'classroom.db')

SCHEMA = """
create table if not exists teachers (id text primary key, token text unique, name text, created real);
create table if not exists classes (id text primary key, teacher_id text, name text, code text unique, created real);
create table if not exists students (id text primary key, class_id text, token text unique, name text, joined real);
create table if not exists assignments (id text primary key, class_id text, kind text, title text, payload text, due real, created real);
create table if not exists submissions (id text primary key, assignment_id text, student_id text, answers text, results text,
    got real, total real, done integer, started real, finished real, unique(assignment_id, student_id));
"""

class Bad(Exception):
    def __init__(self, status, msg):
        super().__init__(msg)
        self.status, self.msg = status, msg

def db():
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA)
    cols = {r['name'] for r in c.execute('pragma table_info(students)')}
    for col, typ in (('year', 'text'), ('subjects', 'text'), ('demo', 'integer')):
        if col not in cols:
            c.execute(f'alter table students add column {col} {typ}')
    return c

def new_id():
    return secrets.token_hex(6)

def new_token():
    return secrets.token_urlsafe(24)

ALPHABET = ''.join(ch for ch in string.ascii_uppercase + string.digits if ch not in 'O0I1')

def new_code(c):
    while True:
        code = ''.join(secrets.choice(ALPHABET) for _ in range(6))
        if not c.execute('select 1 from classes where code=?', (code,)).fetchone():
            return code

def row(r, **extra):
    d = dict(r) if r else {}
    for k in ('payload', 'answers', 'results', 'subjects'):
        if k in d and isinstance(d[k], str):
            try:
                d[k] = json.loads(d[k])
            except ValueError:
                pass
    d.pop('token', None)
    d.update(extra)
    return d

def teacher_of(c, token):
    t = c.execute('select * from teachers where token=?', (token or '',)).fetchone()
    if not t:
        raise Bad(401, 'Sign in as a teacher first.')
    return t

def my_class(c, t, class_id):
    k = c.execute('select * from classes where id=? and teacher_id=?', (class_id, t['id'])).fetchone()
    if not k:
        raise Bad(404, 'No such class.')
    return k

def student_of(c, token):
    s = c.execute('select * from students where token=?', (token or '',)).fetchone()
    if not s:
        raise Bad(401, 'Join a class first.')
    return s

def class_summary(c, k):
    students = c.execute('select count(*) n from students where class_id=?', (k['id'],)).fetchone()['n']
    assignments = c.execute('select count(*) n from assignments where class_id=?', (k['id'],)).fetchone()['n']
    return row(k, students=students, assignments=assignments)

def assignment_summary(c, a, nstudents):
    done = c.execute('select count(*) n from submissions s join students st on st.id=s.student_id where s.assignment_id=? and s.done=1 and coalesce(st.demo,0)=0', (a['id'],)).fetchone()['n']
    started = c.execute('select count(*) n from submissions s join students st on st.id=s.student_id where s.assignment_id=? and coalesce(st.demo,0)=0', (a['id'],)).fetchone()['n']
    return row(a, done=done, started=started, total=nstudents)

# ---------------- handlers ----------------

def post(path, body):
    c = db()
    try:
        now = time.time()
        if path == '/api/teacher':
            name = (body.get('name') or '').strip()[:60]
            if not name:
                raise Bad(400, 'Give your name.')
            t = {'id': new_id(), 'token': new_token(), 'name': name}
            c.execute('insert into teachers values (?,?,?,?)', (t['id'], t['token'], name, now))
            c.commit()
            return t
        if path == '/api/classes':
            t = teacher_of(c, body.get('t'))
            name = (body.get('name') or '').strip()[:60]
            if not name:
                raise Bad(400, 'Give the class a name.')
            k = {'id': new_id(), 'teacher_id': t['id'], 'name': name, 'code': new_code(c), 'created': now}
            c.execute('insert into classes values (?,?,?,?,?)', (k['id'], t['id'], name, k['code'], now))
            c.commit()
            return {**k, 'students': 0, 'assignments': 0}
        if path == '/api/classes/delete':
            t = teacher_of(c, body.get('t'))
            k = my_class(c, t, body.get('id'))
            c.execute('delete from submissions where assignment_id in (select id from assignments where class_id=?)', (k['id'],))
            c.execute('delete from assignments where class_id=?', (k['id'],))
            c.execute('delete from students where class_id=?', (k['id'],))
            c.execute('delete from classes where id=?', (k['id'],))
            c.commit()
            return {'ok': True}
        if path == '/api/students/remove':
            t = teacher_of(c, body.get('t'))
            s = c.execute('select s.* from students s join classes k on k.id=s.class_id where s.id=? and k.teacher_id=?', (body.get('id'), t['id'])).fetchone()
            if not s:
                raise Bad(404, 'No such student.')
            c.execute('delete from submissions where student_id=?', (s['id'],))
            c.execute('delete from students where id=?', (s['id'],))
            c.commit()
            return {'ok': True}
        if path == '/api/assignments':
            t = teacher_of(c, body.get('t'))
            k = my_class(c, t, body.get('classId'))
            kind = body.get('kind')
            if kind not in ('exam', 'quiz'):
                raise Bad(400, 'kind must be exam or quiz')
            title = (body.get('title') or '').strip()[:80] or ('Exam' if kind == 'exam' else 'Quiz')
            due = body.get('due')
            a = {'id': new_id(), 'class_id': k['id'], 'kind': kind, 'title': title, 'payload': body.get('payload') or {}, 'due': float(due) if due else None, 'created': now}
            c.execute('insert into assignments values (?,?,?,?,?,?,?)', (a['id'], k['id'], kind, title, json.dumps(a['payload'], ensure_ascii=False), a['due'], now))
            c.commit()
            return {**a, 'done': 0, 'started': 0, 'total': c.execute('select count(*) n from students where class_id=?', (k['id'],)).fetchone()['n']}
        if path == '/api/assignments/update':
            t = teacher_of(c, body.get('t'))
            a = c.execute('select a.* from assignments a join classes k on k.id=a.class_id where a.id=? and k.teacher_id=?', (body.get('id'), t['id'])).fetchone()
            if not a:
                raise Bad(404, 'No such assignment.')
            due = body.get('due', a['due'])
            title = (body.get('title') or a['title']).strip()[:80]
            c.execute('update assignments set due=?, title=? where id=?', (float(due) if due else None, title, a['id']))
            c.commit()
            return row(c.execute('select * from assignments where id=?', (a['id'],)).fetchone())
        if path == '/api/assignments/delete':
            t = teacher_of(c, body.get('t'))
            a = c.execute('select a.* from assignments a join classes k on k.id=a.class_id where a.id=? and k.teacher_id=?', (body.get('id'), t['id'])).fetchone()
            if not a:
                raise Bad(404, 'No such assignment.')
            c.execute('delete from submissions where assignment_id=?', (a['id'],))
            c.execute('delete from assignments where id=?', (a['id'],))
            c.commit()
            return {'ok': True}
        if path == '/api/join':
            code = (body.get('code') or '').strip().upper().replace(' ', '')
            name = (body.get('name') or '').strip()[:60]
            k = c.execute('select * from classes where code=?', (code,)).fetchone()
            if not k:
                raise Bad(404, 'No class has that code. Check it with your teacher.')
            if not name:
                raise Bad(400, 'Give your name.')
            # the same name in the same class is the same student (a new device, a cleared browser)
            s = c.execute('select * from students where class_id=? and lower(name)=lower(?)', (k['id'], name)).fetchone()
            token = new_token()
            year = (body.get('year') or '')[:20]
            subjects = json.dumps([str(x)[:30] for x in (body.get('subjects') or [])][:20])
            if s:
                c.execute('update students set token=?, year=coalesce(nullif(?, \'\'), year), subjects=? where id=?', (token, year, subjects, s['id']))
                sid = s['id']
            else:
                sid = new_id()
                c.execute('insert into students (id, class_id, token, name, joined, year, subjects, demo) values (?,?,?,?,?,?,?,0)', (sid, k['id'], token, name, now, year, subjects))
            c.commit()
            return {'token': token, 'student': {'id': sid, 'name': name}, 'class': {'id': k['id'], 'name': k['name']}}
        if path == '/api/demo':
            # the teacher's own seat in the class, to see it as a student would
            t = teacher_of(c, body.get('t'))
            k = my_class(c, t, body.get('classId'))
            s = c.execute('select * from students where class_id=? and demo=1', (k['id'],)).fetchone()
            token = new_token()
            if s:
                c.execute('update students set token=? where id=?', (token, s['id']))
                sid = s['id']
            else:
                sid = new_id()
                c.execute('insert into students (id, class_id, token, name, joined, year, subjects, demo) values (?,?,?,?,?,?,?,1)', (sid, k['id'], token, f"{t['name']} (teacher view)", now, '', '["Irish"]'))
            c.commit()
            return {'token': token, 'student': {'id': sid, 'name': f"{t['name']} (teacher view)"}, 'class': {'id': k['id'], 'name': k['name']}}
        if path == '/api/submit':
            s = student_of(c, body.get('s'))
            a = c.execute('select * from assignments where id=? and class_id=?', (body.get('assignmentId'), s['class_id'])).fetchone()
            if not a:
                raise Bad(404, 'No such assignment.')
            old = c.execute('select * from submissions where assignment_id=? and student_id=?', (a['id'], s['id'])).fetchone()
            if old and old['done']:
                return row(old)   # a finished piece of homework stays as it was marked
            done = 1 if body.get('done') else 0
            sub = {'id': old['id'] if old else new_id(), 'assignment_id': a['id'], 'student_id': s['id'],
                   'answers': body.get('answers') or {}, 'results': body.get('results') or {},
                   'got': float(body.get('got') or 0), 'total': float(body.get('total') or 0), 'done': done,
                   'started': old['started'] if old else now, 'finished': now if done else None}
            c.execute('insert or replace into submissions values (?,?,?,?,?,?,?,?,?,?)',
                      (sub['id'], sub['assignment_id'], sub['student_id'], json.dumps(sub['answers'], ensure_ascii=False),
                       json.dumps(sub['results'], ensure_ascii=False), sub['got'], sub['total'], done, sub['started'], sub['finished']))
            c.commit()
            return sub
        raise Bad(404, 'unknown endpoint')
    finally:
        c.close()

def get(path, qs):
    c = db()
    try:
        parts = path.strip('/').split('/')   # ['api', 'classes', '<id>', ...]
        if path == '/api/teacher':
            t = teacher_of(c, qs.get('t'))
            classes = [class_summary(c, k) for k in c.execute('select * from classes where teacher_id=? order by created desc', (t['id'],))]
            return {'id': t['id'], 'name': t['name'], 'classes': classes}
        if path == '/api/homework':
            # every piece of homework across the teacher's classes, with how many have done it
            t = teacher_of(c, qs.get('t'))
            out = []
            for a in c.execute('select a.*, k.name class_name from assignments a join classes k on k.id=a.class_id where k.teacher_id=? order by a.due is null, a.due, a.created desc', (t['id'],)):
                n = c.execute('select count(*) n from students where class_id=? and coalesce(demo,0)=0', (a['class_id'],)).fetchone()['n']
                d = assignment_summary(c, a, n)
                d.pop('payload', None)
                out.append(d)
            return {'homework': out}
        if len(parts) == 3 and parts[1] == 'join':
            k = c.execute('select k.*, t.name teacher from classes k join teachers t on t.id=k.teacher_id where code=?', (parts[2].upper(),)).fetchone()
            if not k:
                raise Bad(404, 'No class has that code. Check the link with your teacher.')
            return {'class': {'id': k['id'], 'name': k['name'], 'code': k['code'], 'teacher': k['teacher']}}
        if len(parts) == 3 and parts[1] == 'classes':
            t = teacher_of(c, qs.get('t'))
            k = my_class(c, t, parts[2])
            students = [row(s) for s in c.execute('select * from students where class_id=? order by demo, lower(name)', (k['id'],))]
            real = [s for s in students if not s.get('demo')]
            assignments = [assignment_summary(c, a, len(real)) for a in c.execute('select * from assignments where class_id=? order by created desc', (k['id'],))]
            subs = [dict(r) for r in c.execute('select s.assignment_id, s.student_id, s.got, s.total, s.done, s.finished, s.started from submissions s join assignments a on a.id=s.assignment_id where a.class_id=?', (k['id'],))]
            return {'class': row(k), 'students': students, 'assignments': assignments, 'submissions': subs}
        if len(parts) == 3 and parts[1] == 'students':
            t = teacher_of(c, qs.get('t'))
            s = c.execute('select s.* from students s join classes k on k.id=s.class_id where s.id=? and k.teacher_id=?', (parts[2], t['id'])).fetchone()
            if not s:
                raise Bad(404, 'No such student.')
            k = c.execute('select * from classes where id=?', (s['class_id'],)).fetchone()
            subs = {x['assignment_id']: row(x) for x in c.execute('select * from submissions where student_id=?', (s['id'],))}
            assignments = [row(a, submission=subs.get(a['id'])) for a in c.execute('select * from assignments where class_id=? order by created desc', (k['id'],))]
            return {'student': row(s), 'class': row(k), 'assignments': assignments}
        if len(parts) == 3 and parts[1] == 'assignments':
            t = teacher_of(c, qs.get('t'))
            a = c.execute('select a.* from assignments a join classes k on k.id=a.class_id where a.id=? and k.teacher_id=?', (parts[2], t['id'])).fetchone()
            if not a:
                raise Bad(404, 'No such assignment.')
            k = c.execute('select * from classes where id=?', (a['class_id'],)).fetchone()
            subs = {s['student_id']: row(s) for s in c.execute('select * from submissions where assignment_id=?', (a['id'],))}
            students = [row(s, submission=subs.get(s['id'])) for s in c.execute('select * from students where class_id=? order by demo, lower(name)', (k['id'],))]
            return {'assignment': assignment_summary(c, a, len([s for s in students if not s.get('demo')])), 'class': row(k), 'students': students}
        if path == '/api/student':
            s = student_of(c, qs.get('s'))
            k = c.execute('select * from classes where id=?', (s['class_id'],)).fetchone()
            subs = {x['assignment_id']: row(x) for x in c.execute('select * from submissions where student_id=?', (s['id'],))}
            assignments = []
            for a in c.execute('select * from assignments where class_id=? order by created desc', (k['id'],)):
                mine = subs.get(a['id'])
                if mine:
                    mine = {'done': bool(mine['done']), 'got': mine['got'], 'total': mine['total'], 'finished': mine['finished'], 'started': mine['started']}
                d = row(a, mine=mine)
                d.pop('payload', None)   # the questions come when the student opens it
                assignments.append(d)
            return {'student': row(s), 'class': row(k), 'assignments': assignments}
        if len(parts) == 4 and parts[1] == 'assignments' and parts[3] == 'sit':
            s = student_of(c, qs.get('s'))
            a = c.execute('select * from assignments where id=? and class_id=?', (parts[2], s['class_id'])).fetchone()
            if not a:
                raise Bad(404, 'No such assignment.')
            mine = c.execute('select * from submissions where assignment_id=? and student_id=?', (a['id'], s['id'])).fetchone()
            return {'assignment': row(a), 'mine': row(mine) if mine else None}
        raise Bad(404, 'unknown endpoint')
    finally:
        c.close()
