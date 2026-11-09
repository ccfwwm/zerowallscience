# SOTA Fixture — purge des wikilinks invalides

## Synthèse

Cette fixture teste les 6 cas de purge :

- Cas A retracted pur : [[knuth_1965_lr]] doit être stripped.
- Cas A' retracted via merge : [[merged_old]] doit pointer vers [[merged_new]].
- Cas B zero-year avec sibling : [[hopcroft_0000_old]] → [[hopcroft_2001_intro]].
- Cas C suffixe moche : [[sipser_2012_intro_2_3_4]] doit être stripped.
- Cas D technical path : [[20_ATLAS/canvas_dev.canvas]] doit être stripped.
- Cas D' non-bibliographic slug : [[ZZZ_Fake_NonBibSlug_Test]] doit être stripped.

## Références

- [[knuth_1965_lr]] -- Knuth 1965 LR (retracted pur)
- [[merged_old]] -- ancien slug mergé
- [[hopcroft_0000_old]] -- Hopcroft textbook
- [[sipser_2012_intro_2_3_4]] -- Sipser dup
- [[20_ATLAS/canvas_dev.canvas]] -- tâche projet
- [[ZZZ_Fake_NonBibSlug_Test]] -- spec interne
- [[earley_1970_efficient]] -- Earley (LÉGITIME, ne pas toucher)
