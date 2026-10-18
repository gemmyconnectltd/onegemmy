from pydantic import BaseModel, ValidationInfo, field_validator


class TrimmedModel(BaseModel):
    """Normalize human input before validation; preserve credentials verbatim."""

    @field_validator("*", mode="before")
    @classmethod
    def trim_text(cls, value: object, info: ValidationInfo) -> object:
        if isinstance(value, str) and not any(
            word in info.field_name for word in ("password", "token", "secret")
        ):
            return value.strip()
        return value
