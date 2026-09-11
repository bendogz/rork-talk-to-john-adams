/**
 * The Foundations essay: the actual historical roots of the American order,
 * laid out plainly — with a question for each section that the visitor can put
 * to Mr. Adams himself in the live conversation.
 */

export interface FoundationSection {
  /** Roman numeral shown on the section medallion. */
  numeral: string;
  title: string;
  paragraphs: string[];
  /** The question sent to the live conversation when the visitor clicks. */
  question: string;
}

export const FOUNDATIONS_TITLE = "The Foundations of the American Order";
export const FOUNDATIONS_SUBTITLE = "The sources that actually shaped it, and what they really said";

export const FOUNDATIONS_INTRO = [
  "America's founding was neither a pure secular Enlightenment project nor a formal Christian confessional state. It was the work of men drawing from several deep wells at once: the natural-rights philosophy of John Locke, the prudence and inherited order defended by Edmund Burke, and a broadly Christian moral imagination about human nature, sin, and the limits of earthly power.",
  "What follows is the truthful historical picture — precise about the primary documents and the Founders' own words, giving full weight to the Christian influences, and neither exaggerating nor minimizing anything. Each section ends with a seal: press it, and that very question is put to John Adams himself, live, in his own voice.",
];

export const FOUNDATIONS_SECTIONS: FoundationSection[] = [
  {
    numeral: "I",
    title: "John Locke: Natural Rights, Consent, and Their Christian Ground",
    paragraphs: [
      "John Locke's Second Treatise of Government (1689) supplied the American Founding its political grammar. Human beings, he argued, possess natural rights — life, liberty, and property — prior to and independent of any government. Government exists by the consent of the governed for the limited purpose of securing those rights, and when it systematically violates them, the people may alter or abolish it. The Declaration of Independence speaks this language almost verbatim, adapting Locke's triad to “life, liberty and the pursuit of happiness.”",
      "What is often left out is that Locke's political philosophy rested on explicitly Christian assumptions. In the Treatises he grounds human equality in creation itself: every person is “the workmanship of one omnipotent, and infinitely wise Maker,” and so no one has a natural right to rule over another by nature. Earthly authority is bounded because all authority is derivative — a stewardship answerable to God, not absolute power. Locke's case for religious liberty in A Letter Concerning Toleration likewise flows from his theology: belief cannot be coerced, and civil magistrates have no commission over souls.",
      "Historians still debate how much weight to give Locke against the older republican tradition of civic virtue and self-government (Cato's Letters, the country opposition writers, the heritage of English constitutionalism). But on the central American question — why government exists and what limits it — Locke's natural-rights teaching, standing on Christian ground, was the dominant voice. Jefferson called him one of “the three greatest men that have ever lived.”",
    ],
    question:
      "Sir, how did Mr. Locke's ideas of natural rights, government by consent, and limited government shape the American Founding — and what Christian assumptions about creation and equality lay beneath his philosophy?",
  },
  {
    numeral: "II",
    title: "Edmund Burke: Ordered Liberty, Tradition, and Prudence",
    paragraphs: [
      "Edmund Burke never wrote a treatise on the American founding, but his cast of mind became foundational to the Anglo-American conservative tradition that American thought absorbed. Against the French Revolution's claim that society could be redesigned overnight from abstract first principles, Burke's Reflections on the Revolution in France (1790) argued that liberty is durable only when it is ordered liberty — liberty disciplined by tradition, inherited institutions, moral restraint, and the accumulated wisdom of generations.",
      "Burke's teaching was above all a lesson in prudence: politics is a practical art, judging concrete circumstances, not the mechanical application of abstract theory. He defended “prejudice” — the ready, inherited moral knowledge embedded in custom and religion — as the bank and capital of nations, and warned that a state that burns its inherited institutions to the ground would find that mobs do not build; they demolish. His prediction of revolutionary terror — chaos followed by military dictatorship — came true with grim precision.",
      "The American founders read Burke, and his sympathy for the American cause (his 1775 Speech on Conciliation with America) made him beloved in the colonies. Through later channels — the Federalist jurisprudence of restraint, and eventually the conservative tradition of Russell Kirk, who placed Burke at the head of The Conservative Mind — Burke's skepticism of radical abstract redesign became a permanent strain in American constitutional thought: reverence for the inherited Constitution, and the conviction that moral order must precede political liberty.",
    ],
    question:
      "What say you of Mr. Burke? How did his defense of ordered liberty, tradition, and prudence — and his great judgment upon the French Revolution — come to shape conservative thought in America?",
  },
  {
    numeral: "III",
    title: "The Christian Intellectual and Moral Influence on the Founding",
    paragraphs: [
      "The Declaration of Independence opens by appealing to “the Laws of Nature and of Nature's God” and grounds human equality in the act of creation: “all men are created equal, that they are endowed by their Creator with certain unalienable Rights.” Whatever else Jefferson intended, the document's authority rests on a theological claim — rights come from God, not from governments, and therefore no government may lawfully take them away.",
      "The Constitution's machinery rests on a Christian-era realism about human nature. “If men were angels,” Madison wrote in Federalist 51, “no government would be necessary... If angels were to govern men, neither external nor internal controls on government would be necessary.” The entire architecture of checks and balances, separation of powers, and enumerated powers institutionalizes the Augustinian and Reformation conviction that human beings are sinful and power corrupts — that ambition must counteract ambition. Limited government is, at bottom, a theological claim about what fallen creatures can safely be trusted with.",
      "The Founders themselves said religion was indispensable. Washington's Farewell Address (1796): “Of all the dispositions and habits which lead to political prosperity, Religion and Morality are indispensable supports... Let it simply be asked, where is the security for property, for reputation, for life, if the sense of religious obligation desert the oaths?” John Adams, 1798: “Our Constitution was made only for a moral and religious People. It is wholly inadequate to the government of any other.” Benjamin Franklin called the 1787 Convention to prayer mid-deliberation. Whatever their private theologies, virtually all the founders agreed publicly: a free republic, resting on virtue rather than force, cannot survive without religion and morals.",
    ],
    question:
      "Sir, how did Christian ideas — a Creator endowing unalienable rights, a sober view of human sinfulness, and religion as the indispensable support of a free republic — inform the Declaration, the Constitution, and the early republic?",
  },
  {
    numeral: "IV",
    title: "The Religious Beliefs of the Founders: A True Range, Not a Caricature",
    paragraphs: [
      "The Founders were not a uniform body of orthodox believers — nor were they mostly secular deists hostile to Christianity. They were a genuinely varied company, and honesty requires presenting the actual range.",
      "Many were sincere, professing Christians of various Protestant traditions: Patrick Henry, Samuel Adams, John Jay (president of the American Bible Society), Roger Sherman, and the Reverend John Witherspoon, the Presbyterian minister who signed the Declaration and taught Madison at Princeton. John Adams was a lifelong Unitarian — a devout Christian by his own account, but a rejector of the Trinity and full divinity of Christ as understood by orthodox Calvinists. Jefferson was a rationalist who reworked the Gospels with a razor, excising the miracles while calling himself a Christian and insisting on Jesus's moral teachings. Franklin drifted from youthful deism toward a belief in a superintending Providence, and Washington attended church faithfully yet left no clear statement on the central doctrines, receiving communion only rarely according to contemporary accounts.",
      "What they were not, on the evidence: a wall of hostile secularists. They routinely invoked Providence in public documents, called national days of prayer and thanksgiving, attended church at high public rates, and wrote constitutions — the state ones especially — saturated with explicitly Christian language. Nor were they, most of them, orthodox theologians. The honest picture is a Protestant Christian culture containing a strong orthodox core, a substantial moderate middle, and a heterodox enlightened wing — all of whom believed religion and morality were socially indispensable.",
    ],
    question:
      "Tell me plainly, Mr. Adams: what were the religious beliefs of the Founders? Were you uniform orthodox Christians, secular deists — or something more varied and honest than either caricature?",
  },
  {
    numeral: "V",
    title: "The Barton Thesis: America's Christian Founding, and the Debate over It",
    paragraphs: [
      "David Barton and Tim Barton of WallBuilders advance a reading of the founding that deserves to be stated in its strongest form: that America's founding was deeply and intentionally Christian; that the Founders were predominantly Bible-believing Christians; that Christian principles were foundational to the Declaration, the Constitution, and early American law and culture; and that later secular interpreters — especially mid-twentieth-century courts and textbooks — systematically downplayed or erased this reality.",
      "The Barton case rests on real evidence. The state constitutions of the founding era invoke God and Christian duty explicitly. Congress commissioned Bibles, appointed chaplains, and issued official days of prayer. Church membership and attendance rates in the founding generation were high by any standard. The founders' public rhetoric was saturated with providential language. WallBuilders has also gathered an enormous archive of original documents — sermons, proclamations, letters — that genuinely complicates the older textbook story of a purely secular founding. On these points, even historians hostile to the thesis concede that secularization narratives overstated the case.",
      "Where the thesis draws scholarly fire is in its strongest claims. Professional historians — including conservative Christian ones — have argued that Barton at times quotes selectively, flattens the heterodox founders (Jefferson especially) into orthodox believers, and reads late-revivalist religiosity backward into 1776. David Barton's 2012 book The Jefferson Lies was pulled by its own Christian publisher, Thomas Nelson, after historians documented serious errors — an episode that sharpened but did not end the debate. The fair verdict: the founding was far more Christian than the secularization story allowed, and less uniformly orthodox than the strongest Barton claims assert. The truth is in the documents, and the documents reward reading.",
    ],
    question:
      "Mr. Barton of WallBuilders contends the founding was deeply and intentionally Christian, and that secular interpreters have buried the evidence. Sir, how much weight does that reading of the record deserve — and where does it overreach?",
  },
  {
    numeral: "VI",
    title: "The Constitutional Design: Neither Theocracy nor Secular State",
    paragraphs: [
      "The federal Constitution created no established national church. It prohibited religious tests for federal office (Article VI: “no religious Test shall ever be required as a Qualification to any Office or public Trust under the United States”) — itself a landmark of religious liberty. And the First Amendment (1791) did two things at once: it forbade Congress from making any law “respecting an establishment of religion,” and it forbade Congress from “prohibiting the free exercise thereof.”",
      "Two clarifications prevent caricature on both sides. First: the federal government was barred from establishing religion, but the states were not — several maintained official churches (Congregationalist in New England, Episcopal in the South) well into the early nineteenth century, Massachusetts until 1833. The founders did not see church establishment at the state level as incompatible with liberty, though they all understood the federal government would have none. Second: the same First Congress that wrote the First Amendment appointed congressional chaplains, and the same Washington who signed it proclaimed national days of thanksgiving in explicitly Christian-friendly terms. The design was not hostility to religion; it was national non-establishment combined with vigorous accommodation.",
      "So: America was not founded as a theocracy — no church holds civil power, no doctrine is legally enforced, conscience is free. But neither was it founded as a secular state in the modern sense. It was shaped decisively by Christian moral and political ideas — natural rights grounded in creation, sin-checked power, covenantal consent, charity as duty — and deliberately designed to be hospitable to Christianity and to all religion, without coercing any. Neither pure Enlightenment project nor confessional state: a constitutional order built by Christians and skeptics together, on ground both could stand on.",
    ],
    question:
      "Was America founded as a Christian nation, Mr. Adams? Clarify the constitutional design for us — no established church, no religious tests, free exercise — and how Christianity nonetheless shaped and was welcomed into the order.",
  },
];

export const FOUNDATIONS_EPIGRAPH =
  "“Power must never be trusted without a check.” — John Adams, 1772";

export const FOUNDATIONS_SOURCES =
  "Sources: Locke, Two Treatises of Government (1689) and A Letter Concerning Toleration (1689); Burke, Reflections on the Revolution in France (1790) and Speech on Conciliation with America (1775); the Declaration of Independence (1776); The Federalist 51 (1788); Washington's Farewell Address (1796); Adams to the Massachusetts Militia (1798); the Constitution of the United States (1787–1791).";
