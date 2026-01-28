"""Configuration management for Episteme.

Uses pydantic-settings to load configuration from environment variables
and .env files. All settings have sensible defaults for local development.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseSettings(BaseSettings):
    """Database connection settings."""

    model_config = SettingsConfigDict(env_prefix="DB_")

    # Neo4j (Graph Database)
    neo4j_uri: str = Field(
        default="bolt://localhost:7687",
        description="Neo4j connection URI",
    )
    neo4j_user: str = Field(
        default="neo4j",
        description="Neo4j username",
    )
    neo4j_password: SecretStr = Field(
        default=SecretStr("episteme_dev"),
        description="Neo4j password",
    )

    # PostgreSQL (Document Store)
    postgres_host: str = Field(default="localhost", description="PostgreSQL host")
    postgres_port: int = Field(default=5432, description="PostgreSQL port")
    postgres_user: str = Field(default="episteme", description="PostgreSQL username")
    postgres_password: SecretStr = Field(
        default=SecretStr("episteme_dev"),
        description="PostgreSQL password",
    )
    postgres_db: str = Field(default="episteme", description="PostgreSQL database name")

    @property
    def postgres_url(self) -> str:
        """Get the PostgreSQL connection URL."""
        password = self.postgres_password.get_secret_value()
        return f"postgresql+asyncpg://{self.postgres_user}:{password}@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"

    # Redis (Cache/Broker)
    redis_url: str = Field(
        default="redis://localhost:6379/0",
        description="Redis connection URL",
    )


class VectorSettings(BaseSettings):
    """Vector database settings."""

    model_config = SettingsConfigDict(env_prefix="VECTOR_")

    # Provider: "pinecone" for production, "qdrant" for local development
    provider: Literal["pinecone", "qdrant"] = Field(
        default="qdrant",
        description="Vector database provider",
    )

    # Pinecone settings (production)
    pinecone_api_key: SecretStr | None = Field(
        default=None,
        description="Pinecone API key",
    )
    pinecone_environment: str = Field(
        default="us-east-1",
        description="Pinecone environment/region",
    )
    pinecone_index_name: str = Field(
        default="episteme-claims",
        description="Pinecone index name",
    )

    # Qdrant settings (local development)
    qdrant_host: str = Field(default="localhost", description="Qdrant host")
    qdrant_port: int = Field(default=6333, description="Qdrant port")
    qdrant_collection_name: str = Field(
        default="claims",
        description="Qdrant collection name",
    )


class LLMSettings(BaseSettings):
    """LLM provider settings."""

    model_config = SettingsConfigDict(env_prefix="LLM_")

    # Anthropic API
    anthropic_api_key: SecretStr = Field(
        ...,
        description="Anthropic API key",
    )

    # Default models for different tasks
    extraction_model: str = Field(
        default="claude-sonnet-4-20250514",
        description="Model for claim extraction",
    )
    matching_model: str = Field(
        default="claude-sonnet-4-20250514",
        description="Model for claim matching",
    )
    decomposition_model: str = Field(
        default="claude-sonnet-4-20250514",
        description="Model for claim decomposition",
    )
    assessment_model: str = Field(
        default="claude-sonnet-4-20250514",
        description="Model for claim assessment",
    )
    governance_model: str = Field(
        default="claude-sonnet-4-20250514",
        description="Model for governance agents (steward, reviewer, arbitrator)",
    )
    arbitration_model: str = Field(
        default="claude-opus-4-5-20250101",
        description="Model for high-stakes arbitration decisions",
    )

    # Rate limiting
    max_requests_per_minute: int = Field(
        default=60,
        description="Maximum API requests per minute",
    )
    max_tokens_per_minute: int = Field(
        default=100000,
        description="Maximum tokens per minute",
    )


class ProcessingSettings(BaseSettings):
    """Claim processing settings."""

    model_config = SettingsConfigDict(env_prefix="PROCESSING_")

    # Decomposition
    max_decomposition_depth: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Maximum depth for recursive decomposition",
    )
    decomposition_confidence_threshold: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Minimum confidence to include a subclaim",
    )

    # Matching
    matching_similarity_threshold: float = Field(
        default=0.85,
        ge=0.0,
        le=1.0,
        description="Minimum similarity to consider a match",
    )
    matching_top_k: int = Field(
        default=20,
        ge=1,
        le=100,
        description="Number of candidates to retrieve for matching",
    )

    # Assessment
    assessment_propagation_enabled: bool = Field(
        default=True,
        description="Whether to propagate assessment changes to parents",
    )

    # Contribution review
    auto_accept_confidence_threshold: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="Confidence threshold for auto-accepting contributions",
    )
    auto_reject_confidence_threshold: float = Field(
        default=0.95,
        ge=0.0,
        le=1.0,
        description="Confidence threshold for auto-rejecting contributions",
    )
    escalation_confidence_threshold: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Below this confidence, escalate to arbitrator",
    )


class APISettings(BaseSettings):
    """API server settings."""

    model_config = SettingsConfigDict(env_prefix="API_")

    host: str = Field(default="0.0.0.0", description="API server host")
    port: int = Field(default=8000, description="API server port")
    debug: bool = Field(default=False, description="Enable debug mode")
    reload: bool = Field(default=False, description="Enable auto-reload")

    # CORS
    cors_origins: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:5173"],
        description="Allowed CORS origins",
    )

    # Rate limiting
    rate_limit_requests: int = Field(
        default=100,
        description="Requests per minute per client",
    )

    # Authentication
    api_key_header: str = Field(
        default="X-API-Key",
        description="Header name for API key authentication",
    )


class Settings(BaseSettings):
    """Main application settings.

    Aggregates all sub-settings and provides environment-based configuration.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Environment
    environment: Literal["development", "staging", "production"] = Field(
        default="development",
        description="Deployment environment",
    )

    # Sub-settings
    database: DatabaseSettings = Field(default_factory=DatabaseSettings)
    vector: VectorSettings = Field(default_factory=VectorSettings)
    llm: LLMSettings = Field(default_factory=LLMSettings)
    processing: ProcessingSettings = Field(default_factory=ProcessingSettings)
    api: APISettings = Field(default_factory=APISettings)

    # Feature flags
    enable_contributions: bool = Field(
        default=True,
        description="Enable community contributions",
    )
    enable_arbitration: bool = Field(
        default=True,
        description="Enable dispute arbitration",
    )
    enable_multi_model_consensus: bool = Field(
        default=False,
        description="Use multiple models for arbitration consensus",
    )

    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.environment == "production"

    @property
    def is_development(self) -> bool:
        """Check if running in development."""
        return self.environment == "development"


@lru_cache
def get_settings() -> Settings:
    """Get cached application settings.

    Returns:
        Settings instance (cached after first call)
    """
    return Settings()
