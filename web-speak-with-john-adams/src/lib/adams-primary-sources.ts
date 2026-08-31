/**
 * Primary-source map for the John Adams historical-memory layer.
 *
 * These are authoritative public collections and individual documents to use
 * when extending the D-ID RAG knowledge base. We keep source metadata here,
 * rather than embedding large copyrighted modern editions in the client.
 */
export interface AdamsPrimarySource {
  id: string;
  title: string;
  date?: string;
  kind: "autobiography" | "diary" | "letter" | "essay" | "constitutional" | "public-paper" | "family-record";
  url: string;
  memoryUse: string;
}

export const ADAMS_PRIMARY_SOURCES: readonly AdamsPrimarySource[] = [
  {
    id: "adams-papers",
    title: "The Adams Papers / Papers of John Adams",
    kind: "autobiography",
    url: "https://founders.archives.gov/about/Adams",
    memoryUse: "Master documentary collection for John Adams's correspondence, state papers, legal papers, diary, and autobiography.",
  },
  {
    id: "adams-diary-autobiography",
    title: "Diary and Autobiography of John Adams",
    kind: "autobiography",
    url: "https://founders.archives.gov/content/volumes",
    memoryUse: "Use for personal chronology, family life, education, reading, travel, political thought, and first-person recollection.",
  },
  {
    id: "thoughts-government",
    title: "Thoughts on Government",
    date: "April 1776",
    kind: "essay",
    url: "https://founders.archives.gov/documents/Adams/06-04-02-0026-0004",
    memoryUse: "Primary source for Adams's constitutional theory, virtue, mixed government, representation, and separation of powers.",
  },
  {
    id: "hooper-march-1776",
    title: "To William Hooper",
    date: "27 March 1776",
    kind: "letter",
    url: "https://founders.archives.gov/documents/Adams/06-04-02-0026-0002",
    memoryUse: "Primary evidence for Adams's reading, republican theory, law, and his definition of a republic as an empire of laws rather than men.",
  },
  {
    id: "warren-may-1776",
    title: "To James Warren",
    date: "12 May 1776",
    kind: "letter",
    url: "https://founders.archives.gov/documents/Adams/06-04-02-0077",
    memoryUse: "Use for Adams's constitutional concerns about judicial independence, legislative structure, and the dangers of crude one-house government.",
  },
  {
    id: "sullivan-may-1776",
    title: "To James Sullivan",
    date: "26 May 1776",
    kind: "letter",
    url: "https://founders.archives.gov/documents/Adams/06-04-02-0091",
    memoryUse: "Primary source for consent, representation, legal fictions, government, and Adams's understanding of human nature and political obligation.",
  },
  {
    id: "warren-june-1776",
    title: "To James Warren",
    date: "16 June 1776",
    kind: "letter",
    url: "https://founders.archives.gov/documents/Adams/06-04-02-0123",
    memoryUse: "Use for Adams's reaction to revolutionary constitutions, Virginia politics, and his own constitutional proposals.",
  },
  {
    id: "dana-august-1776",
    title: "To Francis Dana",
    date: "16 August 1776",
    kind: "letter",
    url: "https://founders.archives.gov/documents/Adams/06-04-02-0213",
    memoryUse: "Use for Adams's views on state constitutional design, executive power, and his discomfort with a single legislative assembly.",
  },
  {
    id: "adams-family-papers",
    title: "Adams Family Papers: An Electronic Archive",
    kind: "family-record",
    url: "https://www.masshist.org/digitaladams/",
    memoryUse: "Family correspondence, diary, and autobiography material; especially useful for Abigail, children, separations, domestic concerns, and emotional life.",
  },
  {
    id: "loc-adams-family-guide",
    title: "Library of Congress: American Founders — Adams",
    kind: "family-record",
    url: "https://guides.loc.gov/american-founders-papers/founders-a-e",
    memoryUse: "Authoritative guide to the documentary collections and access points for Adams's diaries, autobiography, correspondence, and papers.",
  },
];
