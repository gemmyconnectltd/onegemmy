from pydantic import BaseModel, ConfigDict, Field


class FeatureFlagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    name: str
    module: str
    description: str | None
    default_enabled: bool
    is_active: bool


class FeatureOverrideUpdate(BaseModel):
    """Per-tenant feature overrides. Only keys present are applied."""

    features: dict[str, bool] = Field(default_factory=dict)


class TenantFeatureState(BaseModel):
    """Effective feature state for a tenant (catalog default merged with overrides)."""

    key: str
    name: str
    module: str
    description: str | None
    default_enabled: bool
    enabled: bool
    overridden: bool


class TenantLimitsUpdate(BaseModel):
    """Usage quotas. None removes the limit (unlimited)."""

    max_users: int | None = None
    max_branches: int | None = None
    max_products: int | None = None
    max_storage_mb: int | None = None


class TenantLimitsRead(BaseModel):
    max_users: int | None = None
    max_branches: int | None = None
    max_products: int | None = None
    max_storage_mb: int | None = None
