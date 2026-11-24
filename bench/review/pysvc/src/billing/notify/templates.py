"""Plain-text reminder bodies rendered from named templates."""

REMINDER_TEMPLATES: dict[str, str] = {
    "friendly": (
        "Hello {customer_name},\n"
        "\n"
        "Invoice {invoice_id} for {amount} was due on {due_date}.\n"
        "Please arrange payment at your earliest convenience.\n"
        "\n"
        "Thank you.\n"
    ),
    "firm": (
        "Hello {customer_name},\n"
        "\n"
        "Invoice {invoice_id} for {amount} is now overdue. It was due on {due_date}.\n"
        "Please pay within seven days to avoid further action.\n"
        "\n"
        "Regards.\n"
    ),
    "final": (
        "Hello {customer_name},\n"
        "\n"
        "This is the final notice for invoice {invoice_id}, {amount}, due on {due_date}.\n"
        "Payment is required immediately.\n"
        "\n"
        "Regards.\n"
    ),
}


def template_names() -> tuple[str, ...]:
    """Return the available template names in definition order."""
    return tuple(REMINDER_TEMPLATES)


def render_reminder(template_name: str, values: dict[str, str]) -> str:
    """Render the named template with values; raises KeyError on unknown names or fields."""
    template = REMINDER_TEMPLATES[template_name]
    return template.format_map(values)
