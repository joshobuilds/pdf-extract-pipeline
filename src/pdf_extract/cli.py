"""Command-line interface. `pdf-extract run ...`"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer
from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table

from pdf_extract.extractor import extract_many
from pdf_extract.presets import PRESETS, get_preset
from pdf_extract.schema import load_schema
from pdf_extract.exporter import write_excel, write_json

load_dotenv()

app = typer.Typer(
    add_completion=False,
    help="Schema-driven PDF extraction. Turn messy PDFs into clean structured data.",
)
console = Console()


@app.command()
def run(
    pdfs: Annotated[
        list[Path],
        typer.Argument(help="One or more PDF files to extract from.", exists=True),
    ],
    schema: Annotated[
        Path | None,
        typer.Option("--schema", "-s", help="Path to a schema YAML file.", exists=True),
    ] = None,
    preset: Annotated[
        str | None,
        typer.Option("--preset", "-p", help=f"Built-in preset. Options: {', '.join(PRESETS)}"),
    ] = None,
    out_dir: Annotated[
        Path,
        typer.Option("--out", "-o", help="Output directory for JSON + Excel."),
    ] = Path("outputs"),
) -> None:
    """Extract fields from one or more PDFs. Use either --schema or --preset."""

    if not schema and not preset:
        console.print("[red]Error:[/red] provide either --schema PATH or --preset NAME.")
        raise typer.Exit(code=1)
    if schema and preset:
        console.print("[red]Error:[/red] use --schema or --preset, not both.")
        raise typer.Exit(code=1)

    loaded_schema = load_schema(schema) if schema else get_preset(preset)  # type: ignore[arg-type]

    console.print(f"[bold]Schema:[/bold] {loaded_schema.name}")
    console.print(f"[bold]Files:[/bold] {len(pdfs)}")
    console.print()

    with console.status("[cyan]Extracting..."):
        results = extract_many(list(pdfs), loaded_schema)

    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = write_json(results, out_dir / "results.json")
    excel_path = write_excel(results, loaded_schema, out_dir / "results.xlsx")

    _print_summary(results, loaded_schema)

    console.print()
    console.print(f"[green]JSON:[/green] {json_path}")
    console.print(f"[green]Excel:[/green] {excel_path}")


@app.command()
def presets() -> None:
    """List built-in schema presets."""
    table = Table(title="Built-in Presets")
    table.add_column("Name", style="cyan")
    table.add_column("Description")
    for name in PRESETS:
        schema = get_preset(name)
        table.add_row(name, schema.description or schema.name)
    console.print(table)


def _print_summary(results, schema) -> None:
    table = Table(title="Extraction Summary")
    table.add_column("File", style="cyan")
    table.add_column("Confidence", justify="right")
    table.add_column("Missing", style="yellow")
    table.add_column("Warnings", style="red")

    for r in results:
        table.add_row(
            Path(r.source_path).name,
            f"{r.confidence:.2f}",
            str(len(r.missing_fields)),
            str(len(r.warnings)),
        )
    console.print(table)


if __name__ == "__main__":
    app()
