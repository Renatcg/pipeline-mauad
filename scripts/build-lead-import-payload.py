import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd


DEFAULT_OAB = Path("/Users/renatocguimaraes/Downloads/Contatos OAB.xls")
DEFAULT_VINHOS = Path("/Users/renatocguimaraes/Downloads/Lista de participantes - VINHOS_NA_SERRA_-_3_EDIO_-_ESTAO_TERESPOLIS (patrocinio).xlsx")
DEFAULT_PIPELINE = Path("/Users/renatocguimaraes/Downloads/PipeLine Mauad.xlsx")
DEFAULT_OUTPUT = Path("/private/tmp/pipeline-import/leads-import-payload.json")

PIPELINE_STATUSES = [
    "NOVO LEAD",
    "ATENDIMENTO",
    "SIMULAÇÃO",
    "VISITAÇÃO",
    "ANÁLISE CRÉDITO",
    "PROPOSTA",
    "CONTRATO EMITIDO",
    "CONTRATO ASSINADO",
]


def text(value):
    if pd.isna(value):
        return ""
    value = str(value).strip()
    return "" if value.lower() in {"nan", "nat", "none", "-"} else value


def slug(value):
    value = text(value).lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")[:80] or "lead"


def date_filled(value):
    if pd.isna(value):
        return False
    if isinstance(value, (datetime, pd.Timestamp)):
        return True
    value_text = text(value)
    return bool(value_text and value_text not in {"0", "0.0"})


def lead_id(prefix, *parts):
    joined = "-".join(slug(part) for part in parts if text(part))
    return f"{prefix}-{joined}"


def build_oab(path):
    df = pd.read_excel(path, header=None)
    leads = []
    for index, row in df.iterrows():
        name = text(row[0])
        if not name:
            continue
        phone = text(row[7])
        email = text(row[8])
        address = ", ".join(part for part in [text(row[1]), text(row[2]), text(row[3]), text(row[4]), text(row[5])] if part)
        leads.append({
            "id": lead_id("base-oab", index + 1, name),
            "externalId": f"OAB-{index + 1}",
            "name": name.title(),
            "phone": phone,
            "email": email,
            "assistant": email,
            "source": "OAB",
            "sourceStatus": "Base OAB",
            "status": "Base OAB",
            "address": address,
            "inPipeline": False,
            "favorite": False,
            "order": index + 1,
        })
    return leads


def build_vinhos(path):
    df = pd.read_excel(path, header=7)
    leads = []
    for index, row in df.iterrows():
        first = text(row.get("Nome"))
        last = text(row.get("Sobrenome"))
        if not first:
            continue
        full_name = f"{first} {last}".strip()
        phone = text(row.get("Telefone"))
        email = text(row.get("Email"))
        subscription = text(row.get("Ordem de inscrição")) or str(index + 1)
        leads.append({
            "id": lead_id("base-vinhos", subscription, full_name),
            "externalId": f"VINHOS-{subscription}",
            "name": full_name.title(),
            "phone": phone,
            "email": email,
            "assistant": email,
            "source": "VINHOS NA SERRA",
            "sourceStatus": "Base Vinhos na Serra",
            "status": "Base Vinhos na Serra",
            "city": text(row.get("Cidade")),
            "state": text(row.get("Estado")),
            "inPipeline": False,
            "favorite": False,
            "order": index + 1,
        })
    return leads


def infer_pipeline_status(row):
    status_text = f"{text(row.get('Status'))} {text(row.get('Observação'))}".lower()
    if any(word in status_text for word in ["assinado"]):
        return "CONTRATO ASSINADO"
    if any(word in status_text for word in ["contrato", "falta assinar"]):
        return "CONTRATO EMITIDO"
    stages = [
        ("Contrato Assinado", "CONTRATO ASSINADO"),
        ("Contrato", "CONTRATO EMITIDO"),
        ("Emissão Contrato", "CONTRATO EMITIDO"),
        ("Proposta", "PROPOSTA"),
        ("Análise Créd", "ANÁLISE CRÉDITO"),
        ("Visita", "VISITAÇÃO"),
        ("Simulação", "SIMULAÇÃO"),
        ("Atendimento", "ATENDIMENTO"),
    ]
    for column, status in stages:
        if column in row.index and date_filled(row.get(column)):
            return status
    return "NOVO LEAD"


def build_pipeline(path):
    leads = []
    for sheet in ["Mauad", "GOLF"]:
        df = pd.read_excel(path, sheet_name=sheet, header=1)
        if "Cliente" not in df.columns:
            continue
        df = df[df["Cliente"].notna()]
        for _, row in df.iterrows():
            name = text(row.get("Cliente"))
            if not name:
                continue
            number = text(row.get("Nº")) or str(len(leads) + 1)
            status = infer_pipeline_status(row)
            source_detail = text(row.get("Origem"))
            leads.append({
                "id": lead_id("pipeline-mauad", sheet, number, name),
                "externalId": f"PIPE-{sheet}-{number}",
                "name": name.title(),
                "phone": text(row.get("Contato")),
                "assistant": source_detail,
                "source": "PIPELINE MAUAD",
                "sourceDetail": source_detail,
                "status": status,
                "pipelineStatusOriginal": text(row.get("Status")),
                "notes": text(row.get("Observação")),
                "assignedName": text(row.get("Corretor")).title(),
                "project": text(row.get("Empr")),
                "unit": text(row.get("Unidade")),
                "realEstateAgency": text(row.get("Imobiliária")),
                "inPipeline": True,
                "favorite": False,
                "order": len(leads) + 1,
            })
    return leads


def main():
    parser = argparse.ArgumentParser(description="Gera pacote de importação de leads para o Pipeline Mauad.")
    parser.add_argument("--oab", type=Path, default=DEFAULT_OAB)
    parser.add_argument("--vinhos", type=Path, default=DEFAULT_VINHOS)
    parser.add_argument("--pipeline", type=Path, default=DEFAULT_PIPELINE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    leads = []
    sources = {
        "OAB": build_oab(args.oab),
        "VINHOS NA SERRA": build_vinhos(args.vinhos),
        "PIPELINE MAUAD": build_pipeline(args.pipeline),
    }
    for source_leads in sources.values():
        leads.extend(source_leads)

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "pipelineStatuses": PIPELINE_STATUSES,
        "summary": {source: len(source_leads) for source, source_leads in sources.items()},
        "leads": leads,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(args.output), "summary": payload["summary"], "total": len(leads)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
