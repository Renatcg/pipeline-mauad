import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_INPUT = Path("/Users/renatocguimaraes/Downloads/rd-mauad-net-br-leads-todos-os-contatos-da-base-de-leads.csv")
DEFAULT_OUTPUT = Path("/private/tmp/pipeline-import/rdstation-import-payload.json")


def text(value):
    value = "" if value is None else str(value).strip()
    return "" if value.lower() in {"nan", "none", "null", '""'} else value.strip('"').strip()


def slug(value):
    value = text(value).lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")[:90] or "lead"


def lead_id(index, email, name, phone):
    key = email or phone or name or str(index)
    return f"base-rd-station-{slug(key)}"


def build_payload(input_path=DEFAULT_INPUT, output_path=DEFAULT_OUTPUT):
    with input_path.open("r", encoding="utf-16") as file:
        reader = csv.DictReader(file, delimiter="\t")
        leads = []
        seen = set()
        for index, row in enumerate(reader, start=1):
            email = text(row.get("Email"))
            name = text(row.get("Nome"))
            phone = text(row.get("Celular")) or text(row.get("Telefone"))
            if not any([email, name, phone]):
                continue
            display_name = name or email or phone or f"Lead RD {index}"
            item_id = lead_id(index, email, display_name, phone)
            if item_id in seen:
                item_id = f"{item_id}-{index}"
            seen.add(item_id)
            leads.append({
                "id": item_id,
                "externalId": f"RD-{index}",
                "name": display_name.title() if name else display_name,
                "phone": phone,
                "email": email,
                "assistant": email,
                "source": "RD STATION",
                "sourceStatus": "Base RD Station",
                "status": "Base RD Station",
                "inPipeline": False,
                "favorite": False,
                "order": index,
            })

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "pipelineStatuses": [],
        "summary": {"RD STATION": len(leads)},
        "leads": leads,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


if __name__ == "__main__":
    payload = build_payload()
    print(json.dumps({"output": str(DEFAULT_OUTPUT), "summary": payload["summary"], "total": len(payload["leads"])}, ensure_ascii=False))
