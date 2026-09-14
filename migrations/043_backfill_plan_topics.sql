BEGIN;

-- The topic bank, for plans that were imported before there was one.
--
-- 042 added the table but nothing to put in it, so a plan brought in during the
-- day between the two deploys has its weeks and its ticks and an empty bank,
-- which shows as a builder with nothing to drag and a topic list with nothing
-- in it. The packaged plan is the only plan there is, so it can be written out
-- here in full rather than guessed at from the weeks: doing it from the weeks
-- would miss the topics that are on the course but not yet scheduled, which are
-- the ones worth seeing.
--
-- Nothing happens on a database with no plan in it, and nothing happens twice:
-- the unique index on (plan_id, title) is what makes the second run a no-op.

WITH packaged(title, category, exam_group, position) AS (
  VALUES
    ('Introduction to Course'::text, 'Course'::text, 'Paper 1'::text, 0::int),
    ('HL Irish Course Overview', 'Course', 'Paper 1', 1),
    ('How to Be Strategic with the Marking Scheme', 'Course', 'Paper 1', 2),
    ('Fáiltiú', 'Oral', 'Oral', 3),
    ('Introduction to Verbs', 'Grammar', 'Paper 1', 4),
    ('Leathan vs Caol', 'Grammar', 'Paper 1', 5),
    ('Sentence Structure', 'Grammar', 'Paper 1', 6),
    ('Aimsir Chaite: Briathra Neamhrialta', 'Grammar', 'Paper 1', 7),
    ('Aimsir Chaite: Briathra Rialta', 'Grammar', 'Paper 1', 8),
    ('Aimsir Láithreach: Briathra Neamhrialta', 'Grammar', 'Paper 1', 9),
    ('Aimsir Láithreach: Briathra Rialta', 'Grammar', 'Paper 1', 10),
    ('Aimsir Fháistineach', 'Grammar', 'Paper 1', 11),
    ('Question Words', 'Grammar', 'Paper 1', 12),
    ('Grammar Consolidation / Common Errors', 'Grammar', 'Paper 1', 13),
    ('Mé Féin', 'Oral', 'Oral', 14),
    ('Clann', 'Oral', 'Oral', 15),
    ('Áit Chónaithe', 'Oral', 'Oral', 16),
    ('Spórt', 'Oral', 'Oral', 17),
    ('Ceol', 'Oral', 'Oral', 18),
    ('Teilifís', 'Oral', 'Oral', 19),
    ('Léitheoireacht', 'Oral', 'Oral', 20),
    ('Post', 'Oral', 'Oral', 21),
    ('Deireadh Seachtaine A.C.', 'Oral', 'Oral', 22),
    ('Deireadh Seachtaine A.L.', 'Oral', 'Oral', 23),
    ('Deireadh Seachtaine A.F.', 'Oral', 'Oral', 24),
    ('Laethanta Saoire A.C.', 'Oral', 'Oral', 25),
    ('Laethanta Saoire A.F.', 'Oral', 'Oral', 26),
    ('Oideachas atá agat', 'Oral', 'Oral', 27),
    ('Céim Ollscoile', 'Oral', 'Oral', 28),
    ('Ardteist & Múinteoireacht', 'Oral', 'Oral', 29),
    ('Córas Oideachais', 'Oral', 'Oral', 30),
    ('Staid na Gaeilge', 'Oral', 'Oral', 31),
    ('Todhchaí na Gaeilge', 'Oral', 'Oral', 32),
    ('Tábhacht na Gaeilge', 'Oral', 'Oral', 33),
    ('Cur chun cinn na Gaeilge', 'Oral', 'Oral', 34),
    ('Alcól & Drugaí', 'Oral', 'Oral', 35),
    ('Meabhairshláinte', 'Oral', 'Oral', 36),
    ('Foréigean', 'Oral', 'Oral', 37),
    ('Caitheamh Aimsirí', 'Oral', 'Oral', 38),
    ('Full Oral Simulation', 'Oral', 'Oral', 39),
    ('Mock Oral / Oral Correction', 'Oral', 'Oral', 40),
    ('Introduction to Essay', 'Aiste', 'Paper 1', 41),
    ('General Opening', 'Aiste', 'Paper 1', 42),
    ('Phrases for Paragraphs', 'Aiste', 'Paper 1', 43),
    ('Rialtas Paragraph', 'Aiste', 'Paper 1', 44),
    ('Future Paragraph', 'Aiste', 'Paper 1', 45),
    ('General Closing', 'Aiste', 'Paper 1', 46),
    ('An Ghaeilge: Aiste', 'Aiste', 'Paper 1', 47),
    ('Sochaí na hÉireann: Aiste', 'Aiste', 'Paper 1', 48),
    ('Daoine Óga: Aiste', 'Aiste', 'Paper 1', 49),
    ('Timpeallacht: Aiste', 'Aiste', 'Paper 1', 50),
    ('Foréigean: Aiste', 'Aiste', 'Paper 1', 51),
    ('Fadhb na Tithíochta: Aiste', 'Aiste', 'Paper 1', 52),
    ('Essay Consolidation / Adapting to Titles', 'Aiste', 'Paper 1', 53),
    ('Sraith 1', 'Sraith Pictiúr', 'Oral', 54),
    ('Sraith 2', 'Sraith Pictiúr', 'Oral', 55),
    ('Sraith 3', 'Sraith Pictiúr', 'Oral', 56),
    ('Sraith 4', 'Sraith Pictiúr', 'Oral', 57),
    ('Sraith 5', 'Sraith Pictiúr', 'Oral', 58),
    ('Sraith 6', 'Sraith Pictiúr', 'Oral', 59),
    ('Sraith 7', 'Sraith Pictiúr', 'Oral', 60),
    ('Sraith 8', 'Sraith Pictiúr', 'Oral', 61),
    ('Sraith 9', 'Sraith Pictiúr', 'Oral', 62),
    ('Sraith 10', 'Sraith Pictiúr', 'Oral', 63),
    ('Dínit an Bhróin', 'Filíocht', 'Paper 2', 64),
    ('Deireadh na Feide', 'Filíocht', 'Paper 2', 65),
    ('Iníon', 'Filíocht', 'Paper 2', 66),
    ('Glaoch Abhaile', 'Filíocht', 'Paper 2', 67),
    ('Úirchill an Chreagáin', 'Filíocht', 'Paper 2', 68),
    ('Clann Lir', 'Prós', 'Paper 2', 69),
    ('Athair', 'Prós', 'Paper 2', 70),
    ('Cuairteoir', 'Prós', 'Paper 2', 71),
    ('Eoinín na nÉan', 'Prós', 'Paper 2', 72),
    ('An tIriseoir', 'Prós', 'Paper 2', 73),
    ('Dordán: Introduction / Structure', 'Dordán', 'Paper 2', 74),
    ('Dordán: Characters & Relationships', 'Dordán', 'Paper 2', 75),
    ('Dordán: Themes & Key Events', 'Dordán', 'Paper 2', 76),
    ('Dordán: Exam Questions', 'Dordán', 'Paper 2', 77),
    ('Dordán: Revision', 'Dordán', 'Paper 2', 78),
    ('Cluastuiscint: Introduction', 'Exam Skills', 'Paper 1', 79),
    ('Cluastuiscint: Cómhrá', 'Exam Skills', 'Paper 1', 80),
    ('Cluastuiscint: Fógra', 'Exam Skills', 'Paper 1', 81),
    ('Cluastuiscint: Píosa Nuachta', 'Exam Skills', 'Paper 1', 82),
    ('Cluastuiscint Masterclass', 'Exam Skills', 'Paper 1', 83),
    ('Léamhthuiscint Explained', 'Exam Skills', 'Paper 1', 84),
    ('Léamhthuiscint Masterclass', 'Exam Skills', 'Paper 1', 85),
    ('Poetry Exam Technique', 'Exam Skills', 'Paper 2', 86),
    ('Prose Exam Technique', 'Exam Skills', 'Paper 2', 87),
    ('Paper 1 Masterclass', 'Exam Skills', 'Paper 1', 88),
    ('Literature Revision', 'Revision', 'Paper 2', 89),
    ('Grammar + Oral + Essay Revision', 'Revision', 'Paper 1', 90),
    ('Listening + Reading Revision', 'Revision', 'Paper 1', 91),
    ('Full Course Revision', 'Revision', 'Paper 1', 92),
    ('Réamhfhocal', 'Grammar', 'Paper 1', 93),
    ('6A', 'Sraith Pictiúr', 'Oral', 94),
    ('Revision Week', 'Revision', 'Paper 1', 95),
    ('Topical Essay Title', 'Aiste', 'Paper 1', 96)
)
INSERT INTO plan_topics(plan_id, title, category, exam_group, position)
SELECT p.id, k.title, k.category, k.exam_group, k.position
FROM course_plans p CROSS JOIN packaged k
ON CONFLICT (plan_id, title) DO NOTHING;

-- And point the weeks at the bank, so the topic list can say where each one
-- landed. Matched on the title, which is how the import links them too.
UPDATE plan_items i
SET topic_id = t.id
FROM plan_weeks w, plan_topics t
WHERE i.week_id = w.id
  AND t.plan_id = w.plan_id
  AND t.title = i.title
  AND i.topic_id IS NULL;

COMMIT;
