// Ready-made content so a host can start a game in one click. Hosts can paste or upload their
// own CSV instead (see the README for the formats). Everything here is plain genealogy
// knowledge or well-known WikiTree features; please review it before using it at an event.

export const CLUE_PACKS = [{
  id: "basics",
  name: "Genealogy and WikiTree basics (5 categories)",
  csv: `Category,Value,Clue,Answer
Kinship,100,Your mother's brother is your ___.,Uncle
Kinship,200,The child of your first cousin is your first cousin ___ removed.,Once|1|1 time
Kinship,300,Half-siblings share exactly this many parents.,One|1
Kinship,400,You and your second cousin share these ancestors.,Great-grandparents|Great grandparents
Kinship,500,Your grandfather's brother's grandson is your ___ cousin.,Second|2nd
Records and Places,100,"This count of the population, first taken in the US in 1790, happens every ten years.",The census|Census
Records and Places,200,US census records are opened to the public after this many years.,72|Seventy-two
Records and Places,300,"William the Conqueror ordered this great survey of England, completed in 1086.",Domesday Book|Domesday
Records and Places,400,"Parish registers of baptisms, marriages and burials were ordered in England in 1538 under this Tudor king.",Henry VIII|Henry the Eighth|Henry 8
Records and Places,500,Ellis Island opened to immigrants in this year.,1892
DNA,100,DNA is shaped like this twisted ladder.,A double helix|Double helix
DNA,200,This kind of DNA is passed from a mother to all of her children.,Mitochondrial DNA|mtDNA|Mitochondrial
DNA,300,"Y-DNA follows this line of the family tree, father to son.",Direct paternal line|Paternal line|Patrilineal
DNA,400,"Shared DNA between relatives is measured in this unit, abbreviated cM.",Centimorgan|Centimorgans
DNA,500,You inherit about this percentage of your autosomal DNA from each parent.,50 percent|50|Half|Fifty
WikiTree,100,"WikiTree is the place ""where genealogists ___"".",Collaborate
WikiTree,200,A WikiTree ID is the last name at ___ plus a hyphen and a number.,Birth
WikiTree,300,WikiTree's Q&A forum goes by this three-character nickname.,G2G
WikiTree,400,WikiTree's ___ Finder shows how two profiles are related.,Connection
WikiTree,500,WikiTree aims to grow just this many family trees: one shared by everyone.,One|1
Genealogy Words,100,A person from whom you are descended.,An ancestor|Ancestor
Genealogy Words,200,Dying without a valid will is called dying this.,Intestate
Genealogy Words,300,A woman's surname at birth is her ___ name.,Maiden
Genealogy Words,400,"In genealogy, ""c."" or ""ca."" before a date, from the Latin circa, means this.",About|Approximately|Around
Genealogy Words,500,The Genealogical Proof Standard has this many elements.,Five|5
`
}];

export const CLUE_TEMPLATE = `Category,Value,Clue,Answer
Surnames,100,"A clue goes here, in quotes if it has a comma.",The answer
Surnames,200,Another clue.,Answer|An accepted alternative
Places,100,A clue for the next category.,Answer
`;

export const CROSSWORD_PACKS = [{
  id: "genealogy",
  name: "Genealogy words (22 words)",
  csv: `Answer,Clue
ANCESTOR,Person from whom you descend
PEDIGREE,Chart of a person's ancestors
CENSUS,Periodic count of a population full of names and ages
SURNAME,Family name
CEMETERY,Burial ground where headstones are found
PROBATE,Court process for validating a will
INTESTATE,Having died without a will
LINEAGE,Line of descent from an ancestor
BAPTISM,Church ceremony often recorded in a parish register
IMMIGRANT,One who comes to live in a new country
GENEALOGY,The study of family history
HEADSTONE,Grave marker carved with names and dates
DESCENDANT,Child; grandchild; or later offspring
MARRIAGE,Record linking two spouses
OBITUARY,Newspaper notice of a death
COUSIN,Child of your aunt or uncle
SIBLING,Brother or sister
MIGRATION,Movement of people from one place to another
PARISH,Local church district that kept records
CITATION,Reference naming where a fact was found
ARCHIVE,Place that preserves historical records
GENERATION,A step in a family line from parent to child
`
}, {
  id: "wikitree",
  name: "WikiTree words (16 words)",
  csv: `Answer,Clue
WIKITREE,Where genealogists collaborate
PROFILE,A WikiTree page about one person
BIOGRAPHY,The story section of a profile
SOURCES,Where facts come from; every profile should cite them
CATEGORY,Tag that groups profiles by place; surname or topic
WATCHLIST,Your list of profiles to keep an eye on
HONOR,___ Code: the pledge WikiTree members follow
CONNECTION,___ Finder shows how two people are related
MERGE,Combine two duplicate profiles into one
PRIVACY,Setting that controls who can see a profile
GEDCOM,File format for exchanging family trees
VOLUNTEER,WikiTree is run by these unpaid helpers
COLLABORATE,To work together; WikiTree's byword
TRUSTED,___ List: people allowed to edit a profile
DNA,Genetic test used to confirm relationships
ANCESTORS,Your forebears; shown in the tree above you
`
}];

export const CROSSWORD_TEMPLATE = `Answer,Clue
ANCESTOR,Person from whom you descend
MARRIAGE,Record linking two spouses
`;

export const WORDSEARCH_PACKS = [{
  id: "genealogy",
  name: "Genealogy words (20 words)",
  csv: `ANCESTOR
PEDIGREE
CENSUS
SURNAME
CEMETERY
PROBATE
LINEAGE
BAPTISM
IMMIGRANT
HEADSTONE
DESCENDANT
MARRIAGE
OBITUARY
COUSIN
SIBLING
PARISH
ARCHIVE
GRANDPARENT
DEED
WILL
`
}, {
  id: "wikitree",
  name: "WikiTree words (15 words)",
  csv: `WikiTree
Profile
Biography
Sources
Category
Watchlist
Honor Code
Connection
Merge
Privacy
GEDCOM
Volunteer
Collaborate
Trusted List
Descendants
`
}];

export const WORDSEARCH_TEMPLATE = `Words
Ancestor
Descendant
Surname
`;

export const WHEEL_PACKS = [{
  id: "genealogy",
  name: "Genealogy and WikiTree puzzles (28 puzzles)",
  csv: `Category,Puzzle
Genealogy Term,FAMILY TREE
Genealogy Term,PEDIGREE CHART
Genealogy Term,MAIDEN NAME
Genealogy Term,CENSUS RECORD
Genealogy Term,BIRTH CERTIFICATE
Genealogy Term,GREAT GRANDPARENTS
Genealogy Term,SECOND COUSIN ONCE REMOVED
Genealogy Term,PARISH REGISTER
Place,ELLIS ISLAND
Place,NATIONAL ARCHIVES
Place,SALT LAKE CITY
Place,STATUE OF LIBERTY
Famous Book,DOMESDAY BOOK
WikiTree,WHERE GENEALOGISTS COLLABORATE
WikiTree,CONNECTION FINDER
WikiTree,HONOR CODE
WikiTree,TRUSTED LIST
WikiTree,FREE SPACE PAGE
Old Occupation,BLACKSMITH
Old Occupation,COAL MINER
Old Occupation,SEAMSTRESS
Old Occupation,TOWN CRIER
Old Occupation,SHIP'S CAPTAIN
Phrase,BLOOD IS THICKER THAN WATER
Phrase,SKELETONS IN THE CLOSET
Phrase,BLACK SHEEP OF THE FAMILY
Phrase,THE APPLE DOESN'T FALL FAR FROM THE TREE
Phrase,IT RUNS IN THE FAMILY
`
}];

export const WHEEL_TEMPLATE = `Category,Puzzle
Place,ELLIS ISLAND
Phrase,SKELETONS IN THE CLOSET
`;
