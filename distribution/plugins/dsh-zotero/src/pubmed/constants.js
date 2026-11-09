// lib/constants.js — single source of truth for the text-mining word lists
// shared by lib/nlp.js (NLP extractor) and lib/pubmed-core.js (portable
// fallback extractor, injected via deps by the bundle entry).
// Dependency-free on purpose: both consumers can reference it.

// Verb STEMS matched with a \w* suffix so every inflection works (regulate,
// regulates, regulated, regulating…). Covers the causal verbs that dominate
// biomedical abstracts; relation direction = subject -> verb -> object.
export const RELATION_VERB_STEMS = [
  'regulat', 'promot', 'inhibit', 'produc', 'driv', 'mediat', 'induc',
  'enhanc', 'modulat', 'influenc', 'increas', 'reduc', 'alter', 'activat',
  'suppress', 'impair', 'restor', 'exacerbat', 'aggravat', 'govern', 'shape',
  'predict', 'stratify', 'disrupt', 'trigger',
]

// Tokens excluded from keyword extraction.
export const STOPWORDS = new Set((
  'a an and the of to in on for with by from or as is are was were be been at '
  + 'this that these those it its not no but more most such their his her our '
  + 'your other between among via within into over under about across during '
  + 'against without until than then also both each any some what which who '
  + 'whom whose when where why how do does did can could should would may '
  + 'might shall will must i we you they he she them him us me my our your '
  + 'into through out up down off onto towards new review study studies '
  + 'results methods method conclusion background objective aim purpose design '
  + 'data analysis group groups effect effects role roles impact influence '
  + 'regulation metabolism metabolic interaction interactions mechanism '
  + 'mechanisms function functions'
).split(/\s+/))
