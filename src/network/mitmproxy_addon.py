import json
import os
import time
from typing import Optional

from mitmproxy import http


OUTPUT_PATH = os.environ.get("MOBILE_DEBUG_MCP_NETWORK_CAPTURE_FILE")


def _ensure_output_path():
    if not OUTPUT_PATH:
        raise RuntimeError("MOBILE_DEBUG_MCP_NETWORK_CAPTURE_FILE is not set")


def _normalize_network_error(message: Optional[str]) -> Optional[str]:
    if not message:
        return None

    value = message.strip().lower()
    if "timed out" in value or "timeout" in value:
        return "timeout"
    if "dns" in value or "name resolution" in value or "host not found" in value:
        return "dns_error"
    if "tls" in value or "ssl" in value or "certificate" in value or "handshake" in value:
        return "tls_error"
    if "connection refused" in value:
        return "connection_refused"
    if "connection reset" in value or "reset by peer" in value:
        return "connection_reset"
    return "unknown_network_error"


def _duration_ms(flow: http.HTTPFlow) -> int:
    request_started = getattr(flow.request, "timestamp_start", None)
    response_ended = getattr(flow.response, "timestamp_end", None) if flow.response else None
    error_timestamp = getattr(flow.error, "timestamp", None) if flow.error else None

    start = request_started if request_started is not None else time.time()
    end = response_ended if response_ended is not None else error_timestamp if error_timestamp is not None else time.time()
    return max(0, round((end - start) * 1000))


def _write_event(event: dict):
    _ensure_output_path()
    with open(OUTPUT_PATH, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, separators=(",", ":")) + "\n")


def response(flow: http.HTTPFlow):
    _write_event(
        {
            "timestamp": round(time.time() * 1000),
            "fullUrl": flow.request.pretty_url,
            "method": flow.request.method,
            "statusCode": flow.response.status_code,
            "networkError": None,
            "durationMs": _duration_ms(flow),
        }
    )


def error(flow: http.HTTPFlow):
    _write_event(
        {
            "timestamp": round(time.time() * 1000),
            "fullUrl": flow.request.pretty_url,
            "method": flow.request.method,
            "statusCode": None,
            "networkError": _normalize_network_error(getattr(flow.error, "msg", None)),
            "durationMs": _duration_ms(flow),
        }
    )
