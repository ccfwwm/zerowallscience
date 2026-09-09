# SOTA Fixture — sections multiples (Local + À procurer + tableau)

## Synthèse

Cette fixture teste l'extraction de plusieurs sections bibliographiques
de natures différentes : local files, refs à acquérir, et tableaux.

## Sources

- **Local** : Hopcroft FR + EN (Textbooks/1_), Sipser FR (Ch. 1), Carton FR (Ch. 1-2)
- **À procurer** : Pratt-Hartmann survey on complexity of NLP problems

## Algorithmes de parsing

| Algo | Complexité | Source |
|---|---|---|
| CYK | O(n³) | Younger 1967 |
| Earley | O(n³) pire cas / O(n²) non-ambigu | Earley 1970 |
| LR(k) | O(n) | Knuth 1965 (LR) |

## Bibliographie complémentaire

- Valiant, L.G. 1975 *General Context-Free Recognition in Less than Cubic Time*, J. Computer and System Sciences, 10(2), 308-314. DOI: 10.1016/S0022-0000(75)80046-8
- Lee, L. 2002 *Fast Context-Free Grammar Parsing Requires Fast Boolean Matrix Multiplication*, J. ACM 49(1), 1-15.

## Notes

Cette section ne doit PAS être détectée comme section bibliographique.
