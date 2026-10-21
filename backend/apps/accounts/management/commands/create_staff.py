import getpass
import os

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Role, User

DEMO_PASSWORDS = {"loomdesk-demo"}


class Command(BaseCommand):
    help = (
        "Create a staff account with its own password. The password is typed at a prompt, or read from the "
        "environment variable named by --password-env (for scripted setups); it's never a command-line argument."
    )

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--name", required=True, help="Full name, shown on receipts and in history.")
        parser.add_argument("--role", required=True, choices=[r.value for r in Role])
        parser.add_argument("--password-env", help="Name of an environment variable holding the password.")
        parser.add_argument(
            "--pin-env", help="Name of an environment variable holding a 4–6 digit discount approval PIN (admins and senior cashiers)."
        )
        parser.add_argument(
            "--skip-existing",
            action="store_true",
            help="If the account already exists, leave it unchanged and succeed (for a start-up script).",
        )

    def _secret(self, env_name: str | None, prompt: str) -> str:
        if env_name:
            value = os.environ.get(env_name, "")
            if not value:
                raise CommandError(f"Environment variable {env_name} is empty or unset.")
            return value
        first = getpass.getpass(prompt)
        if first != getpass.getpass("Again: "):
            raise CommandError("The two entries don't match.")
        return first

    @transaction.atomic
    def handle(self, *args, **options):
        email = User.objects.normalize_email(options["email"].strip()).lower()
        if User.objects.filter(email__iexact=email).exists():
            if options["skip_existing"]:
                # Never touches the existing account: its password, PIN, role and status stay as they are.
                self.stdout.write(f"An account for {email} already exists; left unchanged.")
                return
            raise CommandError(f"An account for {email} already exists.")
        role = options["role"]

        password = self._secret(options["password_env"], "Password: ")
        if password in DEMO_PASSWORDS | {os.environ.get("SEED_DEMO_PASSWORD", "")}:
            raise CommandError("That's the published demo password. Choose a password of your own.")
        user = User(email=email, full_name=options["name"].strip(), role=role)
        try:
            validate_password(password, user)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc
        user.set_password(password)

        if options["pin_env"]:
            if role == Role.CASHIER:
                raise CommandError("Cashiers can't approve discounts, so they don't get a PIN.")
            try:
                user.set_approval_pin(self._secret(options["pin_env"], "Approval PIN: "))
            except ValueError as exc:
                raise CommandError(str(exc)) from exc

        user.full_clean(exclude=["password"])
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Created {user.get_role_display()} account for {email}."))
