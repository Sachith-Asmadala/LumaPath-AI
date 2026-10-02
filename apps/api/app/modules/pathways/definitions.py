"""Compatibility exports for DOC-F13 callers.

DOC-F29 moved the authoritative career taxonomy and learning-resource catalogue to
``apps.api.app.modules.careers.catalog``.  Existing imports remain stable so older
roadmap tests and integrations do not break.
"""
from ..careers.catalog import (  # noqa: F401
    DEFINITION_VERSION,
    TAXONOMY_VERSION,
    PathwaySkillDefinition,
    ResourceDefinition,
    ROLE_PATHWAYS,
    RESOURCE_CATALOG,
    pathway_for,
    resources_for,
    topological_order,
)
