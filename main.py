"""Compatibility entrypoint for local development."""

from src import create_app
from src.cli import cli

__all__ = ["cli", "create_app", "main"]


def main() -> None:
    cli()


if __name__ == "__main__":
    main()
