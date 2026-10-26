"""Removes every em dash from the Foundations page copy (user request: no em dashes there)."""
import re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent / "src"
specific = [
    ("laid out plainly — with", "laid out plainly, with"),
    ("historical picture — precise", "historical picture: precise"),
    ("natural rights — life, liberty, and property — prior", "natural rights (life, liberty, and property) prior"),
    ("derivative — a stewardship", "derivative: a stewardship"),
    ("central American question — why government exists and what limits it — Locke's", "central American question, why government exists and what limits it, Locke's"),
    ("American Founding — and what", "American Founding, and what"),
    ("ordered liberty — liberty disciplined", "ordered liberty: liberty disciplined"),
    ("“prejudice” — the ready, inherited moral knowledge embedded in custom and religion — as", "“prejudice” (the ready, inherited moral knowledge embedded in custom and religion) as"),
    ("revolutionary terror — chaos followed by military dictatorship — came", "revolutionary terror, chaos followed by military dictatorship, came"),
    ("later channels — the Federalist jurisprudence of restraint, and eventually the conservative tradition of Russell Kirk, who placed Burke at the head of The Conservative Mind — Burke's", "later channels (the Federalist jurisprudence of restraint, and eventually the conservative tradition of Russell Kirk, who placed Burke at the head of The Conservative Mind), Burke's"),
    ("constitutional thought: reverence", "constitutional thought: reverence"),
    ("and prudence — and his great judgment upon the French Revolution — come", "and prudence, and his great judgment upon the French Revolution, come"),
    ("theological claim — rights come", "theological claim: rights come"),
    ("power corrupts — that ambition", "power corrupts, that ambition"),
    ("Christian ideas — a Creator endowing unalienable rights, a sober view of human sinfulness, and religion as the indispensable support of a free republic — inform", "Christian ideas (a Creator endowing unalienable rights, a sober view of human sinfulness, and religion as the indispensable support of a free republic) inform"),
    ("orthodox believers — nor were", "orthodox believers, nor were"),
    ("lifelong Unitarian — a devout", "lifelong Unitarian: a devout"),
    ("constitutions — the state ones especially — saturated", "constitutions (the state ones especially) saturated"),
    ("enlightened wing — all of whom", "enlightened wing, all of whom"),
    ("secular deists — or something", "secular deists, or something"),
    ("interpreters — especially mid-twentieth-century courts and textbooks — systematically", "interpreters (especially mid-twentieth-century courts and textbooks) systematically"),
    ("original documents — sermons, proclamations, letters — that", "original documents (sermons, proclamations, letters) that"),
    ("Professional historians — including conservative Christian ones — have", "Professional historians, including conservative Christian ones, have"),
    ("serious errors — an episode", "serious errors, an episode"),
    ("record deserve — and where", "record deserve, and where"),
    ("— itself a landmark", ", itself a landmark"),
    ("a theocracy — no church", "a theocracy: no church"),
    ("Christian moral and political ideas — natural rights grounded in creation, sin-checked power, covenantal consent, charity as duty — and", "Christian moral and political ideas (natural rights grounded in creation, sin-checked power, covenantal consent, charity as duty) and"),
    ("constitutional design for us — no established church, no religious tests, free exercise — and", "constitutional design for us (no established church, no religious tests, free exercise) and"),
    ("without a check.” — John Adams, 1772", "without a check.” John Adams, 1772"),
    ("(1787–1791)", "(1787 to 1791)"),
    ("laid out section by section — each ending", "laid out section by section, each ending"),
    ("Put this question to Mr. Adams — live", "Put this question to Mr. Adams, live"),
]
for name in ["lib/foundations.ts", "pages/Foundations.tsx"]:
    p = root / name
    s = p.read_text()
    for a, b in specific:
        s = s.replace(a, b)
    s = s.replace(") , itself", "), itself").replace(" , itself", ", itself")
    s = s.replace(" — ", ", ").replace("—", ", ").replace("–", " to ")
    p.write_text(s)
