// Guided learning: a concept taught the Brilliant way, a few slides with a picture and a line or two
// each, an interactive diagram to play with, then questions that check it. The first subject with
// one is Biology, and the first lesson is mitosis.
import type { QuizItem } from "./quiz";

export type Step =
    | { kind: "teach"; title: string; text: string; art?: string; interactive?: "phases" | "cycle" | "doubling"; bullets?: string[] }
    | { kind: "question"; item: QuizItem };
export type GuidedLesson = { slug: string; title: string; sub: string; minutes: number; steps: Step[]; ready: boolean };
export type GuidedTopic = { slug: string; name: string; sub: string; lessons: GuidedLesson[] };

const q = (id: string, prompt: string, answer: string, options: string[], why: string, art?: string): Step => ({ kind: "question", item: { id, type: "choose", prompt, answer, options, why, art } });
const order = (id: string, prompt: string, answer: string, why: string): Step => ({ kind: "question", item: { id, type: "order", prompt, answer, words: answer.split(" "), why } });

const tap = (id: string, prompt: string, art: string, answer: string, targets: QuizItem["targets"], why: string): Step => ({ kind: "question", item: { id, type: "tap", prompt, answer, targets, why, art } });
const num = (id: string, prompt: string, answer: string, why: string, art?: string): Step => ({ kind: "question", item: { id, type: "type", prompt, answer, numeric: true, why, art } });
const fill = (id: string, prompt: string, answer: string, why: string, ...alts: string[]): Step => ({ kind: "question", item: { id, type: "type", prompt, answer, alts, why } });

// the spots a learner can tap on the cell drawing (its viewBox is 420 x 260, centre 210,130)
const SPOTS = {
    nucleus: { id: "nucleus", label: "the nucleus", cx: 210, cy: 130, r: 40 },
    membrane: { id: "membrane", label: "the cell membrane", cx: 82, cy: 130, r: 22 },
    centromere: { id: "centromere", label: "a centromere", cx: 210, cy: 82, r: 16 },
    chromatid: { id: "chromatid", label: "a chromatid", cx: 222, cy: 66, r: 14 },
    pole: { id: "pole", label: "a pole", cx: 102, cy: 130, r: 18 },
    equator: { id: "equator", label: "the equator", cx: 210, cy: 200, r: 18 },
    spindle: { id: "spindle", label: "a spindle fibre", cx: 150, cy: 118, r: 14 },
    leftcell: { id: "leftcell", label: "the left daughter cell", cx: 100, cy: 130, r: 40 },
    furrow: { id: "furrow", label: "the cleavage furrow", cx: 210, cy: 92, r: 18 },
};

export const MITOSIS: GuidedLesson = {
    slug: "mitosis",
    title: "Mitosis",
    sub: "How one cell becomes two identical cells",
    minutes: 15,
    ready: true,
    steps: [
        // ---- hook
        { kind: "teach", title: "You started as one cell", text: "One fertilised egg. Every one of the thirty-odd trillion cells in you now came from it, by dividing again and again. Tap Divide and watch the count climb.", interactive: "doubling" },
        q("h1", "A cell divides four times. How many cells are there at the end?", "16", ["4", "8", "32"], "Each division doubles the count: 1, 2, 4, 8, 16. Four doublings give sixteen cells."),
        { kind: "teach", title: "The trick is in the copying", text: "Mitosis makes two cells that are identical to the parent: the same number of chromosomes, the same genes. For that to work, everything has to be copied first and then shared out exactly. That is what the phases are for.", art: "cell:interphase" },
        // ---- the cycle
        { kind: "teach", title: "The cell cycle", text: "A cell spends most of its life in interphase: growing, working and copying its DNA. Mitosis is the short stretch at the end, then cytokinesis splits the cell. Hover the ring to see how the time is shared.", art: "cycle", interactive: "cycle" },
        q("c1", "Where does a cell spend most of its life?", "Interphase", ["Prophase", "Metaphase", "Cytokinesis"], "Interphase is the long working stretch between divisions. Mitosis itself is quick.", "cycle"),
        // ---- interphase
        { kind: "teach", title: "Interphase: copy first", text: "Before anything divides, every chromosome is copied. The copy stays attached to the original at a point called the centromere, so each chromosome is now two identical chromatids. The chromosomes are still long, thin threads, too fine to see.", art: "cell:interphase" },
        tap("t1", "Tap the nucleus, where the chromosomes are kept.", "cell:interphase", "nucleus", [SPOTS.nucleus, SPOTS.membrane, SPOTS.pole], "The nucleus is the large rounded body in the middle; the chromosomes live inside it until prophase."),
        // ---- prophase
        { kind: "teach", title: "Prophase", text: "The threads coil up tightly and become visible as X shapes: two chromatids joined at the centromere. The membrane around the nucleus breaks down, and spindle fibres start to grow from the two poles of the cell.", art: "cell:prophase" },
        tap("t2", "Tap a centromere, where the two chromatids are joined.", "cell:prophase", "centromere", [SPOTS.centromere, SPOTS.chromatid, SPOTS.pole, SPOTS.spindle], "The centromere is the dark dot at the crossing point of each X. The arms either side are the chromatids."),
        fill("f1", "In prophase the nuclear ___ breaks down.", "membrane", "The nuclear membrane breaks down so the spindle fibres can reach the chromosomes.", "nuclear membrane", "envelope"),
        // ---- metaphase
        { kind: "teach", title: "Metaphase", text: "The chromosomes line up along the middle of the cell, the equator. Each centromere is attached to spindle fibres from both poles, like a tug of war about to start. Think M for middle.", art: "cell:metaphase" },
        tap("t3", "Tap the equator of the cell.", "cell:metaphase", "equator", [SPOTS.equator, SPOTS.pole, SPOTS.spindle], "The equator is the line across the middle of the cell, halfway between the two poles. The chromosomes line up along it."),
        q("m1", "Why do the chromosomes line up at the equator?", "So each chromatid can be pulled to an opposite pole", ["To be copied", "To break down the membrane", "To be read"], "Lining up in the middle, with fibres attached from both sides, means one chromatid of each pair goes to each pole.", "cell:metaphase"),
        // ---- anaphase
        { kind: "teach", title: "Anaphase", text: "The centromeres split. The spindle fibres shorten and drag the two chromatids of each chromosome apart, to opposite poles. Each chromatid is now a chromosome in its own right. Think A for apart.", art: "cell:anaphase" },
        fill("f2", "A is for ___: the chromatids are pulled to opposite poles.", "apart", "Anaphase: A for apart, when the spindle fibres pull the chromatids to opposite ends."),
        // ---- telophase and cytokinesis
        { kind: "teach", title: "Telophase", text: "The chromosomes reach the poles and uncoil. A nuclear membrane forms around each set, so the cell now has two nuclei, each with the full set of chromosomes.", art: "cell:telophase" },
        { kind: "teach", title: "Cytokinesis", text: "Finally the cytoplasm divides. In an animal cell the membrane pinches in at the middle, the cleavage furrow, until two cells sit where there was one. Each is a copy of the parent.", art: "cell:cytokinesis" },
        tap("t4", "Tap the cleavage furrow, where the membrane pinches in.", "cell:cytokinesis", "furrow", [SPOTS.furrow, SPOTS.leftcell, SPOTS.pole], "The furrow is the waist where the membrane squeezes in to separate the two daughter cells."),
        // ---- play and spot
        { kind: "teach", title: "Play it through", text: "Press Play and watch the whole division, or drag the slider. Say the names as you go: prophase, metaphase, anaphase, telophase.", art: "cell:interphase", interactive: "phases" },
        q("s1", "Which phase is the cell in?", "Anaphase", ["Metaphase", "Prophase", "Telophase"], "The chromatids have separated and are moving to the poles: anaphase, A for apart.", "cell:anaphase"),
        q("s2", "And now?", "Prophase", ["Interphase", "Metaphase", "Cytokinesis"], "The X shapes are visible and scattered, the membrane is breaking up and the spindle is forming: prophase.", "cell:prophase"),
        q("s3", "And this one?", "Telophase", ["Anaphase", "Metaphase", "Prophase"], "Two new nuclear membranes have formed around two sets of chromosomes: telophase.", "cell:telophase"),
        order("o1", "Put the phases of mitosis in order.", "Prophase Metaphase Anaphase Telophase", "PMAT: prophase (visible), metaphase (middle), anaphase (apart), telophase (two nuclei)."),
        // ---- numbers
        num("n1", "A human body cell has 46 chromosomes. How many does each daughter cell have after mitosis?", "46", "Mitosis keeps the number the same. The copies were made in interphase, so each daughter cell gets a full 46.", "cell:cytokinesis"),
        num("n2", "A fruit fly cell has 8 chromosomes. After one round of mitosis, how many chromosomes are there in total across the two cells?", "16", "Each daughter cell has 8, the full set, so two cells hold 16 between them."),
        // ---- why it matters
        { kind: "teach", title: "Why cells bother", text: "Mitosis is for growth, for repairing damaged tissue, and for asexual reproduction in organisms that copy themselves. What it is not for is making sex cells: those need half the chromosomes, which is meiosis.", bullets: ["Growth: from one cell to trillions", "Repair: new skin over a cut", "Asexual reproduction: strawberry runners, yeast budding"] },
        q("w1", "Which of these is NOT a job for mitosis?", "Making gametes (sex cells)", ["Growth", "Repair of damaged tissue", "Asexual reproduction"], "Gametes are made by meiosis, which halves the chromosome number. Mitosis keeps it the same."),
        { kind: "teach", title: "When control is lost", text: "The cell cycle has checkpoints that decide whether a cell may divide. If those controls fail, a cell keeps dividing when it should stop, and the pile of cells it makes is a tumour. Cancer is mitosis without the brakes.", art: "cycle" },
        q("w2", "Cancer is best described as…", "Uncontrolled mitosis", ["Too little mitosis", "Mitosis without interphase", "A failure of cytokinesis"], "In cancer the checkpoints on the cell cycle fail and cells keep dividing, forming a tumour."),
        // ---- summary
        { kind: "teach", title: "What to remember", text: "Copy in interphase, then PMAT, then split. Two cells, each identical to the parent.", bullets: ["Interphase: DNA copied, each chromosome becomes two chromatids", "Prophase: chromosomes visible, membrane breaks down, spindle forms", "Metaphase: lined up on the equator", "Anaphase: chromatids pulled apart to the poles", "Telophase: two nuclei re-form", "Cytokinesis: the cytoplasm divides", "Same chromosome number in each daughter cell"], art: "cell:cytokinesis" },
    ],
};

const soon = (slug: string, title: string, sub: string): GuidedLesson => ({ slug, title, sub, minutes: 8, ready: false, steps: [] });

export const BIOLOGY: GuidedTopic[] = [
    { slug: "cell-biology", name: "The cell", sub: "Structure, division and what goes on inside", lessons: [MITOSIS, soon("meiosis", "Meiosis", "Halving the chromosomes to make gametes"), soon("cell-structure", "Cell structure", "Plant and animal cells under the microscope"), soon("diffusion-osmosis", "Diffusion and osmosis", "How substances move in and out")] },
    { slug: "enzymes", name: "Enzymes", sub: "Biological catalysts and the factors that affect them", lessons: [soon("enzyme-action", "How enzymes work", "Active site, substrate, product"), soon("enzyme-factors", "Temperature and pH", "Why enzymes have an optimum")] },
    { slug: "genetics", name: "Genetics", sub: "DNA, genes and inheritance", lessons: [soon("dna-structure", "DNA and RNA", "The double helix and the code"), soon("protein-synthesis", "Protein synthesis", "Transcription and translation"), soon("inheritance", "Inheritance", "Dominant, recessive and Punnett squares")] },
    { slug: "ecology", name: "Ecology", sub: "Organisms and their environment", lessons: [soon("food-chains", "Food chains and webs", "Energy flow in an ecosystem"), soon("nutrient-cycles", "Nutrient cycles", "Carbon and nitrogen")] },
    { slug: "human-body", name: "The human body", sub: "Systems and how they are controlled", lessons: [soon("digestion", "Digestion", "From mouth to absorption"), soon("circulation", "The heart and circulation", "Double circulation and the heartbeat"), soon("nervous-system", "The nervous system", "Neurons and the reflex arc")] },
];

export const guidedLesson = (slug: string) => BIOLOGY.flatMap((t) => t.lessons).find((l) => l.slug === slug);
