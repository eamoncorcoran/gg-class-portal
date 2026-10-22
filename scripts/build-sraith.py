#!/usr/bin/env python3
"""
Builds the Sraith Pictiúr revision section from the course document.

    python3 scripts/build-sraith.py "/path/to/Irish for Primary Teaching 2026_27.docx"

Reads every Sraith in the document: its title, its six boxes (each a list of
sentences written "Irish.(English.)" beside the box picture) and any closing
lines (a proverb, a moral). Writes content/sraith/sraith.json and one JPEG per
box picture in content/sraith/img/. Run again whenever the document changes;
the portal reads the files at start-up. Needs macOS (sips) for the pictures.
"""
import json, os, re, subprocess, sys, tempfile, unicodedata, zipfile
import xml.etree.ElementTree as ET

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
def q(ns, tag): return '{%s}%s' % (ns, tag)

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'content', 'sraith')
DASHES = '\u2013\u2014'
CLOSERS = '.!?"”’'


def slug(text):
    s = unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def tidy(text):
    text = text.replace(' ', ' ')
    # A spaced dash introducing a proverb reads as a colon. No dashes are kept.
    text = re.sub(r'\s*[.,]?\s+[' + DASHES + r'-]\s+', ': ', text)
    text = re.sub('[' + DASHES + ']', ',', text)
    return re.sub(r'\s+', ' ', text).strip()


def sentence_case(text):
    """NÍ BHÍONN IN AON RUD ACH SEAL. -> Ní bhíonn in aon rud ach seal."""
    letters = [c for c in text if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.8:
        text = text.lower()
    m = re.match(r'^([\'"“‘]*)(\w)', text)
    if m and m.group(2).islower():
        rest = text[m.end():]
        # nGaeilge, bhFrainc, tSín: an eclipsis or lenited capital stays as it is.
        if not (rest[:1].isupper()):
            text = m.group(1) + m.group(2).upper() + rest
    return text


def after_colon(text):
    """'seanfhocal: “ní thagann' -> 'seanfhocal: “Ní thagann'"""
    return re.sub(r'(:\s*[\'"\u201c\u2018]?)([a-z\u00e1\u00e9\u00ed\u00f3\u00fa])(?![A-Z])', lambda m: m.group(1) + m.group(2).upper(), text)


# Lines the document gives without their lead-in in English.
ENGLISH_FIXES = {
    'Ach mar a deir an seanfhocal: \u201cN\u00ed thagann ciall roimh aois\u201d': 'But as the proverb says: \u201cSense does not come before age.\u201d',
}


def finish(text):
    text = after_colon(sentence_case(text.strip()))
    if text and text[-1] not in CLOSERS:
        text += '.'
    return text


def split_sentence(raw):
    """'•  Thit Liam go talamh.(Liam fell.)' -> ('Thit Liam go talamh.', 'Liam fell.')"""
    text = re.sub(r'^\s*(?:[•\-]|\d+\.)\s*', '', raw).strip()
    m = re.match(r'^(.*?)\s*\(([^()]*)\)\s*$', text)
    if not m:
        return tidy(text), ''
    return tidy(m.group(1)), tidy(m.group(2))


def para_text(p):
    return ''.join(t.text or '' for t in p.iter(q(W, 't')))


def cell_images(cell, rels):
    return [rels[b.get(q(R, 'embed'))] for b in cell.iter(q(A, 'blip')) if b.get(q(R, 'embed')) in rels]


def main(docx):
    z = zipfile.ZipFile(docx)
    rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('word/_rels/document.xml.rels'))}
    body = ET.fromstring(z.read('word/document.xml')).find(q(W, 'body'))

    sraith, current, started = [], None, False
    for el in body:
        tag = el.tag.split('}')[1]
        if tag == 'p':
            text = tidy(para_text(el))
            style = el.find(q(W, 'pPr') + '/' + q(W, 'pStyle'))
            heading = style is not None and style.get(q(W, 'val'), '').lower().startswith('heading')
            if text == 'Imreoir Gortaithe':
                started = True
            if not started or heading or not text:
                continue
            # A Sraith title: a short line on its own, not a label like "SEANFHOCAL:".
            if len(text) < 60 and not text.endswith(':') and '(' not in text:
                current = {'title': text, 'slug': slug(text), 'boxes': [], 'ending': []}
                sraith.append(current)
            continue
        if tag != 'tbl' or current is None:
            continue
        for tr in el.findall(q(W, 'tr')):
            cells = tr.findall(q(W, 'tc'))
            lines = [tidy(para_text(p)) for p in cells[0].iter(q(W, 'p'))] if cells else []
            lines = [l for l in lines if l]
            if not lines or lines[0].startswith(('Pictiúr', 'Briathra', 'Ceisteanna')):
                continue
            images = [img for c in cells for img in cell_images(c, rels)]
            bulleted = [l for l in lines if re.match(r'^\s*(?:•|\d+\.)', l)]
            if bulleted:
                sentences = []
                for l in bulleted:
                    ga, en = split_sentence(l)
                    # The exam worksheet's "Ceisteanna: 1. 2. 3." has no words in it.
                    if ga and re.search(r'[^\W\d_]', ga):
                        sentences.append({'ga': finish(ga), 'en': finish(en) if en else ''})
                if sentences:
                    current['boxes'].append({'sentences': sentences, 'image': images[0] if images else None})
                continue
            # Closing lines: a moral or a proverb, Irish with English in brackets.
            pending = None
            for l in lines:
                ga, en = split_sentence(l)
                if not (ga and en):
                    continue
                if pending:
                    ga = pending['ga'].rstrip(' ,.:') + ': ' + sentence_case(ga)
                    en = pending['en'].rstrip(' ,.:') + ': ' + sentence_case(en)
                    pending = None
                elif re.search(r'seanfhocal[\s,.:]*$', ga, re.I):
                    # "Mar a deir an seanfhocal" leads into the proverb on the next line.
                    pending = {'ga': sentence_case(ga), 'en': sentence_case(en)}
                    continue
                ga, en = finish(ga), finish(en)
                current['ending'].append({'ga': ga, 'en': ENGLISH_FIXES.get(ga, en)})

    img_dir = os.path.join(ROOT, 'img')
    os.makedirs(img_dir, exist_ok=True)
    for name in os.listdir(img_dir):
        os.remove(os.path.join(img_dir, name))
    tmp = tempfile.mkdtemp()
    for s in sraith:
        for i, box in enumerate(s['boxes'], start=1):
            src = box.pop('image')
            box['n'] = i
            box['image'] = None
            if not src:
                continue
            raw = os.path.join(tmp, os.path.basename(src))
            with open(raw, 'wb') as f:
                f.write(z.read('word/' + src))
            out = '%s-%d.jpg' % (s['slug'], i)
            target = os.path.join(img_dir, out)
            subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '72', '-Z', '900', raw, '--out', target],
                           check=True, capture_output=True)
            dims = subprocess.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', target], capture_output=True, text=True).stdout
            box['image'] = {
                'file': out,
                'width': int(re.search(r'pixelWidth: (\d+)', dims).group(1)),
                'height': int(re.search(r'pixelHeight: (\d+)', dims).group(1)),
            }

    with open(os.path.join(ROOT, 'sraith.json'), 'w', encoding='utf-8') as f:
        json.dump({'source': os.path.basename(docx), 'sraith': sraith}, f, ensure_ascii=False, indent=1)
    for s in sraith:
        n = sum(len(b['sentences']) for b in s['boxes'])
        pics = sum(1 for b in s['boxes'] if b['image'])
        print('%-45s boxes %d  pictures %d  sentences %d  ending %d' % (s['title'], len(s['boxes']), pics, n, len(s['ending'])))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
