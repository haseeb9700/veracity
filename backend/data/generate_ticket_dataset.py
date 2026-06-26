import csv
import random
from datetime import datetime, timedelta


random.seed(42)

OUTPUT_FILE = "data/enterprise_tickets_500.csv"
TOTAL_ROWS = 500

departments = [
    "IT",
    "HR",
    "Finance",
    "Operations",
    "Customer Support",
    "Sales",
    "Compliance",
]

channels = ["Email", "Portal", "Phone", "Slack", "Chatbot"]

priorities = ["Low", "Medium", "High", "Critical"]

statuses = ["Resolved", "Open", "In Progress", "Escalated"]

customer_types = ["Internal Employee", "External Customer", "Partner", "Vendor"]

ticket_templates = [
    {
        "category": "Password / Login",
        "department": "IT",
        "phrases": [
            "I forgot my password and cannot log in",
            "Need password reset for my company account",
            "Account locked after multiple login attempts",
            "Unable to access the system due to password issue",
            "Login not working for employee portal",
            "Password expired and reset link is not working",
        ],
        "time_range": (1, 5),
        "priority": ["Low", "Medium"],
    },
    {
        "category": "VPN / Access",
        "department": "IT",
        "phrases": [
            "VPN access is not working from home",
            "Unable to connect to secure network",
            "Remote access keeps disconnecting",
            "Need VPN permission for client project",
            "Cannot access internal tools outside office",
        ],
        "time_range": (3, 12),
        "priority": ["Medium", "High"],
    },
    {
        "category": "Onboarding Delay",
        "department": "HR",
        "phrases": [
            "New employee onboarding is delayed",
            "Laptop and access not ready for new hire",
            "Onboarding checklist is incomplete",
            "Background verification delay blocking start date",
            "Employee onboarding approval pending",
        ],
        "time_range": (24, 96),
        "priority": ["Medium", "High"],
    },
    {
        "category": "Benefits / Payroll",
        "department": "HR",
        "phrases": [
            "Benefits enrollment issue needs review",
            "Payroll deduction looks incorrect",
            "Employee cannot select health insurance option",
            "Need correction in benefits portal",
            "Salary information missing in HR system",
        ],
        "time_range": (12, 72),
        "priority": ["Medium", "High"],
    },
    {
        "category": "Invoice Approval",
        "department": "Finance",
        "phrases": [
            "Vendor invoice approval is delayed",
            "Invoice stuck in approval workflow",
            "Payment request pending manager approval",
            "Finance approval needed for overdue invoice",
            "Purchase order mismatch delaying invoice",
        ],
        "time_range": (18, 80),
        "priority": ["Medium", "High", "Critical"],
    },
    {
        "category": "Refund Request",
        "department": "Customer Support",
        "phrases": [
            "Customer requesting refund for duplicate charge",
            "Refund request pending for customer order",
            "Need refund approval for billing complaint",
            "Customer says payment was charged twice",
            "Refund not processed after cancellation",
        ],
        "time_range": (6, 48),
        "priority": ["Low", "Medium", "High"],
    },
    {
        "category": "Inventory Mismatch",
        "department": "Operations",
        "phrases": [
            "Inventory count does not match system records",
            "Warehouse stock mismatch found during audit",
            "Item quantity incorrect in inventory platform",
            "Missing stock after shipment reconciliation",
            "Inventory discrepancy requires investigation",
        ],
        "time_range": (8, 36),
        "priority": ["Medium", "High"],
    },
    {
        "category": "Compliance Review",
        "department": "Compliance",
        "phrases": [
            "Compliance approval needed for vendor document",
            "Audit evidence missing for policy review",
            "Risk review pending for new supplier",
            "Data retention policy exception needs approval",
            "Compliance checklist incomplete for process",
        ],
        "time_range": (24, 120),
        "priority": ["High", "Critical"],
    },
    {
        "category": "Salesforce / CRM",
        "department": "Sales",
        "phrases": [
            "Salesforce opportunity record not updating",
            "CRM account ownership is incorrect",
            "Lead assignment rule failed",
            "Sales report missing latest pipeline data",
            "Cannot edit customer account in CRM",
        ],
        "time_range": (4, 24),
        "priority": ["Low", "Medium", "High"],
    },
]


def random_date():
    start = datetime(2026, 1, 1)
    offset_days = random.randint(0, 150)
    offset_hours = random.randint(0, 23)
    offset_minutes = random.randint(0, 59)
    return start + timedelta(days=offset_days, hours=offset_hours, minutes=offset_minutes)


def create_ticket(ticket_id):
    template = random.choices(
        ticket_templates,
        weights=[18, 12, 10, 8, 13, 14, 9, 7, 9],
        k=1
    )[0]

    created_at = random_date()
    resolution_time = round(random.uniform(*template["time_range"]), 2)

    # Some tickets are still open, so resolution time may be missing
    status = random.choices(
        statuses,
        weights=[72, 10, 13, 5],
        k=1
    )[0]

    if status in ["Open", "In Progress"] and random.random() < 0.65:
        resolution_time_value = ""
    else:
        resolution_time_value = resolution_time

    phrase = random.choice(template["phrases"])

    # Add realistic messy wording
    if random.random() < 0.20:
        phrase = phrase.upper()

    if random.random() < 0.18:
        phrase = phrase + " please help asap"

    if random.random() < 0.12:
        phrase = phrase.replace("approval", "apprval")

    if random.random() < 0.10:
        phrase = phrase + "!!!"

    department = template["department"]

    # Add missing department sometimes
    if random.random() < 0.03:
        department = ""

    priority = random.choice(template["priority"])

    # Add missing priority sometimes
    if random.random() < 0.02:
        priority = ""

    return {
        "ticket_id": ticket_id,
        "created_date": created_at.strftime("%Y-%m-%d %H:%M:%S"),
        "department": department,
        "issue": phrase,
        "issue_category": template["category"],
        "priority": priority,
        "status": status,
        "channel": random.choice(channels),
        "customer_type": random.choice(customer_types),
        "resolution_time": resolution_time_value,
    }


def main():
    rows = []

    for ticket_id in range(1, TOTAL_ROWS + 1):
        rows.append(create_ticket(ticket_id))

    # Add exact duplicate rows to test duplicate detection
    duplicate_rows = random.sample(rows, 10)
    rows.extend(duplicate_rows)

    fieldnames = [
        "ticket_id",
        "created_date",
        "department",
        "issue",
        "issue_category",
        "priority",
        "status",
        "channel",
        "customer_type",
        "resolution_time",
    ]

    with open(OUTPUT_FILE, mode="w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Generated {len(rows)} rows at {OUTPUT_FILE}")


if __name__ == "__main__":
    main()