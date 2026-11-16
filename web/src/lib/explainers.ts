// What each section of the exam is: where it sits on the paper, what the student has to do and a
// few tips. Shown under the topic title, one line visible with the rest behind "Read more".
// Figures are the current LC Higher Irish pattern (check against the year's paper before quoting).
import { D } from "./data";

export type Explainer = { lead: string; where: string; task: string; tips: string[] };

const aural = {
    where: "Paper 1 opens with the Cluastuiscint (listening test): 60 marks, 10% of the whole exam, about 20 minutes. The recording runs itself; you write as you listen.",
};

export const EXPLAINERS: Record<string, Explainer> = {
    "aural-fogra-announcement": {
        lead: "Cuid A of the listening test: two short radio announcements, each played twice.",
        where: `${aural.where} Cuid A comes first: Fógra a hAon and Fógra a Dó, each heard twice straight through.`,
        task: "Answer short questions in Irish about each announcement: who issued it, who it is for, dates, times, prices, phone numbers, what is on and how to find out more. Each answer is worth 2 or 3 marks and a few words are enough if they carry the point.",
        tips: [
            "Read the questions in the gap before the recording starts so you know what to listen for.",
            "Numbers, dates and place names are the usual targets: jot them as you hear them, tidy up on the second hearing.",
            "Write in Irish. An answer in English scores nothing, but a spelling slip in Irish is usually forgiven if the meaning is clear.",
        ],
    },
    "aural-comhra-conversation": {
        lead: "Cuid B of the listening test: two conversations, each played three times and split into two parts.",
        where: `${aural.where} Cuid B is the middle section: Comhrá a hAon and Comhrá a Dó. Each conversation is played once in full, then again in two halves (An Chéad Mhír and An Dara Mír) with a pause after each half, then once more in full.`,
        task: "Answer questions on each half of the conversation in Irish. They ask why someone did something, what they plan to do, how many, when and where. Several questions want two pieces of information (two reasons, two details), so look for the (i) and (ii) lines.",
        tips: [
            "Use the first full hearing to get the story, the half hearings to fill the answers, and the last hearing to check.",
            "When a question asks for two points, give exactly two clear ones rather than a long sentence.",
            "The questions follow the order of the conversation, so if you miss one, move on and come back on the final hearing.",
        ],
    },
    "aural-piosa-nuachta-news-pieces": {
        lead: "Cuid C of the listening test: two short news items, each played twice.",
        where: `${aural.where} Cuid C closes the test: Píosa Nuachta a hAon and Píosa Nuachta a Dó, each heard twice.`,
        task: "Answer short questions in Irish on each news piece: what happened, where, who was involved, figures and dates, and what will happen next. The language is the formal Irish of radio news, so expect official names and numbers.",
        tips: [
            "News pieces are dense: on the first hearing catch the who, where and what; on the second, the numbers and the final detail.",
            "Keep the names as you hear them, even roughly spelt. Markers look for the fact, not perfect spelling of a surname.",
            "Learn the news vocabulary: comhairle contae, tionscadal, infheistíocht, timpiste, gortaíodh, seoladh.",
        ],
    },
    write: {
        lead: "The Ceapadóireacht on Paper 1: one piece of writing worth 100 marks, your choice of four styles.",
        where: "Paper 1, after the listening test. The Ceapadóireacht is worth 100 marks, a quarter of the written exam. You choose one task from A (an essay), B (a story), C (a newspaper or magazine article) or D (a debate or speech), with two titles offered under most headings. Allow about 75 minutes.",
        task: "Write one piece of around 500 to 600 words on the title you pick, in the style asked for. It is marked for the quality of your Irish (grammar, range, accuracy) and for content (relevance, structure, development of ideas). An off-topic piece loses heavily, however good the Irish.",
        tips: [
            "Pick the title you have the most to say about, not the one that looks easiest.",
            "Plan five or six paragraphs before you write: an opening, three or four points, a close.",
            "Keep a stock of linking phrases and idioms you can use accurately. Accuracy beats ambition.",
            "Leave ten minutes to check verbs, séimhiú and urú, and the genitive after prepositions.",
        ],
    },
    "reading-comprehension": {
        lead: "Ceist 1 on Paper 2: two reading passages, 50 marks each, with comprehension and grammar questions.",
        where: "Paper 2 opens with the Léamhthuiscint: two passages (A and B), 100 marks in total, roughly 50 minutes. Each passage has five comprehension questions and a sixth question on grammar and language.",
        task: "Read each passage and answer in your own Irish, not by copying the text. Questions 1 to 5 point you to a numbered paragraph; question 6 asks you to find and explain grammar features (a verb in a particular tense, an example of the genitive, a prepositional pronoun) and often to write briefly about the style or a word in context.",
        tips: [
            "Read the questions first, then the passage. Each question tells you which paragraph to look in.",
            "Rephrase rather than lift: a copied sentence can lose most of the marks for that answer.",
            "Learn the grammar labels for question 6: ainm briathartha, aidiacht bhriathartha, tuiseal ginideach, forainm réamhfhoclach, modh coinníollach.",
        ],
    },
    "studied-prose-pros-roghnach": {
        lead: "Ceist 2 on Paper 2: a question on one of the prescribed prose texts, 30 marks.",
        where: "Paper 2, Ceist 2. You answer on prose (Prós Ainmnithe or Prós Roghnach, depending on what your class studied) for 30 marks, usually two parts: a longer part worth about 20 marks and a shorter one worth about 10.",
        task: "Write about the text named in the question: a character, a theme, the climax, the setting, or the writer's technique. Back up every point with a reference to the story. The shorter part is often about your own reaction or a comparison with another text.",
        tips: [
            "Know the plot cold so you can place events in order without hesitation.",
            "For each text prepare a character sketch, two themes and one note on style.",
            "Answer the question asked: pull your prepared notes toward it rather than writing everything you know.",
        ],
    },
    "studied-poetry-filiocht-roghnach": {
        lead: "Ceist 3 on Paper 2: a question on one of the prescribed poems, 30 marks.",
        where: "Paper 2, Ceist 3. You answer on poetry (Filíocht Ainmnithe or Filíocht Roghnach) for 30 marks, in two or three parts: a part on the poem's theme or the poet's feelings, a part on technique (imagery, mood, sound), and often a short personal response.",
        task: "Discuss the named poem with reference to its lines. Explain the theme, how the poet's feelings develop, and how imagery, metaphor and sound create the mood. Quote short phrases from the poem to support each point.",
        tips: [
            "Learn six or eight short quotations per poem and know what each one does.",
            "Have Irish terms ready: téama, mothúcháin, íomhánna, meafar, codarsnacht, atmaisféar.",
            "A personal response needs a reason: say what moved you and point to the line that did it.",
        ],
    },
};

const soon: Explainer = {
    lead: "A new prescribed text for the 2027 Leaving Certificate course.",
    where: "Paper 2, in the prose or poetry question (Ceist 2 or Ceist 3) once the new course is examined from 2027.",
    task: "Questions follow the same pattern as the current texts: theme, character or feelings, technique, and a short personal response, each supported with reference to the text.",
    tips: ["Notes and sample questions will appear here as the course settles."],
};

const namedProse = (name: string): Explainer => ({
    lead: `Ceist 2A on Paper 2: the question on ${name}, one of the prescribed prose texts, 30 marks.`,
    where: `Paper 2, Ceist 2A (Prós Ainmnithe), 30 marks. In most years you choose one of two texts under (a) and (b); ${name} has come up in the years listed below. The question is usually a statement about a character, theme or the ending followed by "Déan plé ar an ráiteas sin".`,
    task: `Write a developed answer on ${name}: take the statement apart, make three or four points and support each with a reference to what happens in the text. Keep to the question asked; a retelling of the plot scores little.`,
    tips: [
        `Prepare a character sketch of each main figure in ${name}, two themes and one note on the writer's technique.`,
        "Open by taking a position on the statement, then prove it point by point.",
        "Quote or paraphrase short moments from the text rather than long passages.",
    ],
});
const namedPoem = (name: string): Explainer => ({
    lead: `Ceist 3A on Paper 2: the question on ${name}, one of the prescribed poems, 30 marks.`,
    where: `Paper 2, Ceist 3A (Filíocht Ainmnithe), 30 marks, with the poem printed on the paper. Usually three parts: a statement to discuss (15 marks), a point on technique or effect (6 marks) and a short note on the poet's life and work (9 marks).`,
    task: `Discuss ${name} with reference to its lines: explain the theme and the poet's feelings, show how imagery and sound carry the mood, and finish with the note on the poet. Quote short phrases to support each point.`,
    tips: [
        `Learn six short quotations from ${name} and what each one does.`,
        "The poet note is nine easy marks: a few lines on life, other work and style, learned in advance.",
        "Use the Irish terms: téama, mothúcháin, íomhánna, meafar, codarsnacht, atmaisféar.",
    ],
});

/** The whole subject in one dropdown, for the top of the Irish page. */
export const SUBJECT: Explainer = {
    lead: "Leaving Certificate Irish at Higher Level: an oral, a listening test and two written papers, 600 marks in all.",
    where: "The oral (An Bhéaltriail, 240 marks, 40%) is held in the spring of sixth year. In June, Paper 1 opens with the listening test (60 marks, 10%) and then the Ceapadóireacht, one piece of writing (100 marks). Paper 2 is the reading comprehension (two passages, 100 marks), a prose question (30 marks), a poetry question (30 marks) and the extra poetry question (Ceist 4). Together the written papers carry 60%.",
    task: "Speak Irish for about 15 minutes with an examiner: greeting, a poem read aloud, one of twenty picture sequences, and a conversation on your life and the issues of the day. Then, in June, write in Irish for two papers: answer the listening questions as you hear the recordings, write one composition of around 500 to 600 words, answer on two reading passages in your own words, and answer on one prose text and one poem from the course.",
    tips: [
        "The oral is 40% and sits before the written exams: start the Sraith Pictiúr and the conversation topics early in sixth year.",
        "Every written question here comes with its official marking scheme; check your answers against it, not against your hopes.",
        "Accuracy beats ambition in every part: a shorter answer in correct Irish outscores a long one full of slips.",
    ],
};

export const explainerOf = (slug: string, course2027?: boolean, name?: string): Explainer | undefined =>
    // these notes describe the Irish Higher paper; another subject's topic of the same name gets none
    D().subject !== "irish" || D().level !== "higher"
        ? undefined
        : (EXPLAINERS[slug] ?? (slug.startsWith("prose-") && name ? namedProse(name) : slug.startsWith("poetry-") && name ? namedPoem(name) : course2027 ? soon : undefined));
