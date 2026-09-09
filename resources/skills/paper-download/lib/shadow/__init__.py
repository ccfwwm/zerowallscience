"""Shadow libraries — Anna's Archive et Sci-Hub.

Opt-in strict via la variable d'environnement RESEARCH_ENABLE_SHADOW_LIBS=1.
Voir DISCLAIMER.md à la racine du plugin pour les implications légales.

Le module n'est pas importé par défaut. Pipeline.cascade construit la
CASCADE conditionnellement et n'inclut scihub_optin / annas_archive_optin
que si la variable est activée.
"""
