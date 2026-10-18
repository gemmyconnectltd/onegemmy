"""pawaPay V2. Callbacks are hints only; authenticated GET is the payment authority."""

import base64
import hashlib
import json
import time
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from app.core.config import settings
from app.core.exceptions import AppError, ValidationError


def enabled() -> bool:
    return bool(settings.PAWAPAY_API_TOKEN) and (
        settings.PAWAPAY_ENVIRONMENT == "sandbox" or settings.PAWAPAY_LIVE_ENABLED
    )


def signature_headers(method: str, url: str, body: bytes) -> dict[str, str]:
    if not settings.PAWAPAY_SIGNING_PRIVATE_KEY or not settings.PAWAPAY_SIGNING_KEY_ID:
        return {}
    key = serialization.load_pem_private_key(
        settings.PAWAPAY_SIGNING_PRIVATE_KEY.encode(), password=None
    )
    if not isinstance(key, rsa.RSAPrivateKey):
        raise ValidationError("pawaPay signing requires an RSA private key")
    created = int(time.time())
    date = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    digest = f"sha-512=:{base64.b64encode(hashlib.sha512(body).digest()).decode()}:"
    components = '("@method" "@authority" "@path" "signature-date" "content-digest" "content-type")'
    params = f'{components};alg="rsa-pss-sha512";keyid={json.dumps(settings.PAWAPAY_SIGNING_KEY_ID)};created={created};expires={created + 60}'
    parsed = urlsplit(url)
    base = f'"@method": {method}\n"@authority": {parsed.netloc}\n"@path": {parsed.path}\n"signature-date": {date}\n"content-digest": {digest}\n"content-type": application/json\n"@signature-params": {params}'
    signed = key.sign(
        base.encode(),
        padding.PSS(mgf=padding.MGF1(hashes.SHA512()), salt_length=64),
        hashes.SHA512(),
    )
    return {
        "Signature-Date": date,
        "Content-Digest": digest,
        "Signature-Input": f"sig-pp={params}",
        "Signature": f"sig-pp=:{base64.b64encode(signed).decode()}:",
    }


async def call(method: str, path: str, payload: dict | None = None) -> dict:
    if not enabled():
        raise AppError("pawaPay payments are not configured", status_code=503)
    base = (
        "https://api.pawapay.io"
        if settings.PAWAPAY_ENVIRONMENT == "production"
        else "https://api.sandbox.pawapay.io"
    )
    body = json.dumps(payload, separators=(",", ":")).encode() if payload is not None else None
    headers = {
        "Authorization": f"Bearer {settings.PAWAPAY_API_TOKEN}",
        "Content-Type": "application/json",
    }
    if body is not None:
        try:
            headers.update(signature_headers(method, base + path, body))
        except (ValueError, TypeError) as exc:
            raise AppError("pawaPay signing configuration is invalid", status_code=503) from exc
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
            response = await client.request(method, base + path, content=body, headers=headers)
        response.raise_for_status()
        result = response.json()
        if not isinstance(result, dict):
            raise TypeError("Unexpected response")
        return result
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        # Never include provider response text: it can contain tokens, phone numbers or account data.
        raise AppError(
            "pawaPay is unavailable. Your payment status will be reconciled.", status_code=503
        ) from exc


async def methods() -> dict:
    if not enabled():
        return {
            "provider": "pawapay",
            "mode": settings.PAWAPAY_ENVIRONMENT,
            "configured": False,
            "methods": [],
            "saved_methods_supported": False,
        }
    config = await call("GET", "/v2/active-conf")
    signed_only = config.get("signatureConfiguration", {}).get("signedRequestsOnly", False)
    signing_configured = bool(
        settings.PAWAPAY_SIGNING_PRIVATE_KEY and settings.PAWAPAY_SIGNING_KEY_ID
    )
    methods = []
    # This adapter supports automatic PIN-prompt flows; PREAUTH/REDIRECT_AUTH are not offered.
    for country in config.get("countries", []):
        for provider in country.get("providers", []):
            for currency in provider.get("currencies", []):
                for operation in currency.get("operationTypes", []):
                    deposit = operation.get("DEPOSIT")
                    if (
                        not deposit
                        or deposit.get("authType") != "PROVIDER_AUTH"
                        or (signed_only and not signing_configured)
                    ):
                        continue
                    methods.append(
                        {
                            "provider": provider["provider"],
                            "name": provider.get("displayName", provider["provider"]),
                            "currency": currency["currency"],
                            "country": country["country"],
                            "prefix": country.get("prefix", ""),
                            "minimum": deposit.get("minTransactionLimit"),
                            "maximum": deposit.get("maxTransactionLimit"),
                            "refunds_supported": any(
                                "REFUND" in item for item in currency.get("operationTypes", [])
                            ),
                        }
                    )
    return {
        "provider": "pawapay",
        "mode": settings.PAWAPAY_ENVIRONMENT,
        "configured": True,
        "methods": methods,
        "saved_methods_supported": False,
        "signed_requests_required": signed_only,
        "signing_configured": signing_configured,
    }


def amount_string(amount: int, decimals: int) -> str:
    value = format(Decimal(amount) / (10**decimals), "f")
    return value.rstrip("0").rstrip(".") if "." in value else value


async def initiate(
    reference: uuid.UUID,
    amount: int,
    currency: str,
    decimals: int,
    phone: str,
    network: str,
    invoice: str,
) -> dict:
    config = await methods()
    method = next(
        (
            m
            for m in config["methods"]
            if m["provider"] == network
            and m["currency"] == currency
            and phone.startswith(m["prefix"])
        ),
        None,
    )
    if method is None:
        raise ValidationError(
            "This mobile money provider is not configured for this currency and phone"
        )
    major = Decimal(amount) / (10**decimals)
    if (method["minimum"] and major < Decimal(method["minimum"])) or (
        method["maximum"] and major > Decimal(method["maximum"])
    ):
        raise ValidationError("Invoice amount is outside this provider's transaction limits")
    return await call(
        "POST",
        "/v2/deposits",
        {
            "depositId": str(reference),
            "amount": amount_string(amount, decimals),
            "currency": currency,
            "payer": {"type": "MMO", "accountDetails": {"phoneNumber": phone, "provider": network}},
            "clientReferenceId": invoice,
            "customerMessage": "Pesaa subscription",
        },
    )


async def verify(reference: uuid.UUID) -> dict | None:
    response = await call("GET", f"/v2/deposits/{reference}")
    if response.get("status") == "NOT_FOUND":
        return None
    if response.get("status") != "FOUND" or not isinstance(response.get("data"), dict):
        raise AppError("Unexpected pawaPay status response", status_code=503)
    return response["data"]
