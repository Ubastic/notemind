import json
import logging
import os
import re
import secrets
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from .time_utils import now_beijing

import requests


try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover - optional dependency
    pass

try:
    import dashscope

    HAS_DASHSCOPE = True
except ImportError:  # pragma: no cover - optional dependency
    HAS_DASHSCOPE = False


logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "dashscope").lower()
LLM_API_KEY = os.getenv("LLM_API_KEY") or os.getenv("DASHSCOPE_API_KEY")
LLM_API_BASE_URL = os.getenv("LLM_API_BASE_URL", "").rstrip("/")
LLM_CHAT_MODEL = os.getenv("LLM_CHAT_MODEL", "")
LLM_EMBED_MODEL = os.getenv("LLM_EMBED_MODEL", "")
AI_ENABLED = os.getenv("AI_ENABLED", "false").strip().lower() in ("1", "true", "yes", "on")
SHORT_TITLE_MAX_LEN = int(os.getenv("SHORT_TITLE_MAX_LEN", "32"))


ANON_PLACEHOLDER_PATTERN = re.compile(r"\bANON_[0-9a-f]{8}\b")

EMAIL_PATTERN = re.compile(r"[\w.\-]+@[\w.\-]+\.\w+")
PHONE_PATTERN = re.compile(
    r"(?<!\w)(?:\+?\d{1,3}[\s.-]?)?"
    r"(?:1[3-9]\d{9}|\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4})(?!\w)"
)
URL_PATTERN = re.compile(r"https?://\S+")

JWT_PATTERN = re.compile(r"\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b")
AWS_ACCESS_KEY_PATTERN = re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")
GOOGLE_API_KEY_PATTERN = re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")
SLACK_TOKEN_PATTERN = re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")
GITHUB_TOKEN_PATTERN = re.compile(r"\bgh[opsu]_[A-Za-z0-9]{36,}\b")
STRIPE_KEY_PATTERN = re.compile(r"\bsk_(?:live|test)_[0-9a-zA-Z]{24,}\b")

LABELLED_SECRET_PATTERN = re.compile(
    r"(password|passwd|pwd|token|key|secret|api_key|credential)\s*[:=]\s*\S+",
    re.I,
)
INLINE_SECRET_PATTERN = re.compile(r"(password|token|key|secret|pwd)\s+\S+", re.I)
IP_PATTERN = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b")

HEX_TOKEN_PATTERN = re.compile(r"[a-fA-F0-9]{32,}")
BASE64_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9+/]{24,}={0,2}")
TOKEN_CANDIDATE_PATTERN = re.compile(r"[A-Za-z0-9_+/=\-]{16,}")
PASSWORD_CANDIDATE_PATTERN = re.compile(
    r"[A-Za-z0-9!@#$%^&*()_+=\-\[\]{}|:;,.?/~`]{8,}"
)

SENSITIVE_PATTERNS = [
    LABELLED_SECRET_PATTERN,
    INLINE_SECRET_PATTERN,
    IP_PATTERN,
    EMAIL_PATTERN,
    PHONE_PATTERN,
    URL_PATTERN,
    JWT_PATTERN,
    AWS_ACCESS_KEY_PATTERN,
    GOOGLE_API_KEY_PATTERN,
    SLACK_TOKEN_PATTERN,
    GITHUB_TOKEN_PATTERN,
    STRIPE_KEY_PATTERN,
]

DEFAULT_CATEGORIES = ["credential", "work", "idea", "todo"]


def _is_placeholder(value: str) -> bool:
    return bool(ANON_PLACEHOLDER_PATTERN.fullmatch(value))


def _new_placeholder(mapping: Dict[str, str], original: str) -> str:
    while True:
        placeholder = f"ANON_{secrets.token_hex(4)}"
        if placeholder not in mapping:
            mapping[placeholder] = original
            return placeholder


def _count_char_groups(value: str) -> int:
    groups = 0
    if re.search(r"[a-z]", value):
        groups += 1
    if re.search(r"[A-Z]", value):
        groups += 1
    if re.search(r"\d", value):
        groups += 1
    if re.search(r"[^A-Za-z0-9]", value):
        groups += 1
    return groups


def _looks_like_complex_password(value: str) -> bool:
    if len(value) < 8 or _is_placeholder(value):
        return False
    groups = _count_char_groups(value)
    has_strong_symbol = bool(re.search(r"[!@#$%^&*()+=\[\]{}|:;,.?/~`]", value))
    if groups >= 4 and has_strong_symbol:
        return True
    if groups >= 3 and has_strong_symbol:
        return True
    return False


def _looks_like_token(value: str) -> bool:
    if _is_placeholder(value):
        return False
    if HEX_TOKEN_PATTERN.fullmatch(value):
        return True
    if BASE64_TOKEN_PATTERN.fullmatch(value):
        return True
    if len(value) < 20:
        return False
    if re.search(r"[A-Za-z]", value) and re.search(r"\d", value):
        return True
    if re.search(r"[A-Za-z]", value) and re.search(r"[+/=_-]", value):
        return True
    return False


def _replace_candidates(
    text: str,
    pattern: re.Pattern,
    predicate,
    mapping: Dict[str, str],
) -> str:
    parts: List[str] = []
    last_index = 0
    for match in pattern.finditer(text):
        candidate = match.group(0)
        if not predicate(candidate):
            continue
        parts.append(text[last_index : match.start()])
        parts.append(_new_placeholder(mapping, candidate))
        last_index = match.end()
    if not parts:
        return text
    parts.append(text[last_index:])
    return "".join(parts)


def _contains_candidate(text: str, pattern: re.Pattern, predicate) -> bool:
    for match in pattern.finditer(text):
        if predicate(match.group(0)):
            return True
    return False


def _restore_mapping_in_obj(data: Any, mapping: Dict[str, str]) -> Any:
    if not mapping:
        return data
    if isinstance(data, str):
        return restore_sensitive_data(data, mapping)
    if isinstance(data, list):
        return [_restore_mapping_in_obj(item, mapping) for item in data]
    if isinstance(data, dict):
        return {key: _restore_mapping_in_obj(value, mapping) for key, value in data.items()}
    return data


def anonymize_sensitive_data(text: str) -> Tuple[str, Dict[str, str]]:
    mapping: Dict[str, str] = {}

    def replace_match(match: re.Match) -> str:
        original = match.group(0)
        if _is_placeholder(original):
            return original
        return _new_placeholder(mapping, original)

    anonymized = text
    for pattern in SENSITIVE_PATTERNS:
        anonymized = pattern.sub(replace_match, anonymized)
    anonymized = _replace_candidates(
        anonymized, PASSWORD_CANDIDATE_PATTERN, _looks_like_complex_password, mapping
    )
    anonymized = _replace_candidates(anonymized, TOKEN_CANDIDATE_PATTERN, _looks_like_token, mapping)

    return anonymized, mapping


def restore_sensitive_data(text: str, mapping: Dict[str, str]) -> str:
    restored = text
    for placeholder, original in mapping.items():
        restored = restored.replace(placeholder, original)
    return restored


def detect_sensitive(text: str) -> bool:
    for pattern in SENSITIVE_PATTERNS:
        if pattern.search(text):
            return True
    if _contains_candidate(text, PASSWORD_CANDIDATE_PATTERN, _looks_like_complex_password):
        return True
    if _contains_candidate(text, TOKEN_CANDIDATE_PATTERN, _looks_like_token):
        return True
    return False


def extract_entities(text: str) -> Dict[str, Any]:
    entities: Dict[str, Any] = {}
    ips = re.findall(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", text)
    if ips:
        entities["ips"] = list(dict.fromkeys(ips))
    emails = EMAIL_PATTERN.findall(text)
    if emails:
        entities["emails"] = list(dict.fromkeys(emails))
    phones = PHONE_PATTERN.findall(text)
    if phones:
        entities["phones"] = list(dict.fromkeys(phones))
    urls = URL_PATTERN.findall(text)
    if urls:
        entities["urls"] = list(dict.fromkeys(urls))
    return entities


def _normalize_category_options(categories: Optional[List[str]]) -> List[str]:
    if not categories:
        return DEFAULT_CATEGORIES
    normalized: List[str] = []
    seen = set()
    for item in categories:
        key = str(item or "").strip().lower()
        if not key or key in seen:
            continue
        normalized.append(key)
        seen.add(key)
    return normalized or DEFAULT_CATEGORIES


def _heuristic_category(text: str, categories: Optional[List[str]] = None) -> str:
    lowered = text.lower()
    if re.search(r"(token|password|passwd|pwd|secret|ssh|ip|credential)", lowered):
        default = "credential"
    elif re.search(r"(todo|to-do|task|next|remind|follow up|deadline)", lowered):
        default = "todo"
    elif re.search(r"(project|meeting|review|weekly|progress|work)", lowered):
        default = "work"
    else:
        default = "idea"
    if not categories:
        return default
    options = _normalize_category_options(categories)
    if default in options:
        return default
    for option in options:
        if option in lowered:
            return option
    return options[0] if options else default


def _heuristic_tags(text: str, category: str) -> List[str]:
    tags = {category}
    if "github" in text.lower():
        tags.add("github")
    if "paper" in text.lower():
        tags.add("paper")
    if "server" in text.lower():
        tags.add("server")
    if "token" in text.lower() or "password" in text.lower():
        tags.add("secret")
    words = re.findall(r"[A-Za-z][A-Za-z0-9_-]{2,}", text)
    for word in words[:6]:
        tags.add(word.lower())
    return sorted(tags)[:6]


def _heuristic_summary(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) <= 120:
        return cleaned
    return cleaned[:117] + "..."


def _heuristic_title(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return ""
    if len(cleaned) <= 60:
        return cleaned
    return cleaned[:57] + "..."


def _normalize_short_title(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return ""
    if len(cleaned) <= SHORT_TITLE_MAX_LEN:
        return cleaned
    trimmed = cleaned[:SHORT_TITLE_MAX_LEN].rstrip()
    if " " in trimmed:
        trimmed = trimmed.rsplit(" ", 1)[0].rstrip() or trimmed
    return trimmed


def _heuristic_short_title(text: str) -> str:
    for line in text.splitlines():
        cleaned = line.strip()
        if cleaned:
            return _normalize_short_title(cleaned)
    return _normalize_short_title(text)


def _parse_qwen_json(raw: str) -> Optional[Dict[str, Any]]:
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or start >= end:
        return None
    snippet = raw[start : end + 1]
    try:
        return json.loads(snippet)
    except json.JSONDecodeError:
        return None


def _llm_allowed(use_ai: bool) -> bool:
    return AI_ENABLED and use_ai


def _provider_enabled(provider: str) -> bool:
    return LLM_PROVIDER == provider and bool(LLM_API_KEY)


def _dashscope_ready() -> bool:
    if not (HAS_DASHSCOPE and _provider_enabled("dashscope")):
        return False
    dashscope.api_key = LLM_API_KEY
    return True


def _openai_request(endpoint: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not (_provider_enabled("openai") or _provider_enabled("openai_compatible")):
        return None
    if not LLM_API_BASE_URL:
        return None
    headers = {
        "Authorization": f"Bearer {LLM_API_KEY}",
        "Content-Type": "application/json",
    }
    url = f"{LLM_API_BASE_URL}{endpoint}"
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=20)
    except requests.RequestException:
        return None
    if response.status_code >= 400:
        return None
    return response.json()


def _openai_chat(prompt: str) -> Optional[str]:
    model = LLM_CHAT_MODEL or "gpt-3.5-turbo"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
    }
    data = _openai_request("/v1/chat/completions", payload)
    if not data:
        return None
    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError):
        return None


def _normalize_search_parse(parsed: Optional[Dict[str, Any]], query: str) -> Dict[str, Any]:
    semantic_query = query
    keywords: List[str] = []
    time_start: Optional[str] = None
    time_end: Optional[str] = None
    if isinstance(parsed, dict):
        semantic_query = str(parsed.get("semantic_query") or "").strip() or query
        raw_keywords = parsed.get("keywords")
        if isinstance(raw_keywords, list):
            keywords = [str(item).strip() for item in raw_keywords if str(item).strip()]
        elif isinstance(raw_keywords, str) and raw_keywords.strip():
            keywords = [raw_keywords.strip()]
        raw_start = parsed.get("time_start")
        raw_end = parsed.get("time_end")
        if raw_start:
            time_start = str(raw_start).strip() or None
        if raw_end:
            time_end = str(raw_end).strip() or None
    keywords = [query] + keywords
    deduped: List[str] = []
    seen = set()
    for item in keywords:
        lowered = item.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(item)
    return {
        "semantic_query": semantic_query,
        "keywords": deduped,
        "time_start": time_start,
        "time_end": time_end,
    }


def parse_search_query(
    query: str,
    now: Optional[datetime] = None,
    use_ai: bool = False,
) -> Dict[str, Any]:
    now = now or now_beijing()
    anonymized_query, mapping = anonymize_sensitive_data(query)
    if not _llm_allowed(use_ai):
        normalized = _normalize_search_parse(None, anonymized_query)
        return _restore_mapping_in_obj(normalized, mapping)
    prompt = (
        "You extract search intent and time range for a personal notes app. "
        "Return ONLY valid JSON with keys: semantic_query, keywords, time_start, time_end. "
        "semantic_query should remove time expressions and keep the core intent. "
        "keywords should include important entities, synonyms, and related terms in the user's language. "
        "time_start and time_end should be ISO dates (YYYY-MM-DD) or null. "
        "If there is a relative time phrase (like last month, yesterday), convert it using today's date. "
        f"Today is {now.strftime('%Y-%m-%d')}. "
        f"Query: {anonymized_query}"
    )
    response: Optional[str] = None
    if _dashscope_ready():
        llm_response = dashscope.Generation.call(
            model=LLM_CHAT_MODEL or "qwen-plus",
            prompt=prompt,
            result_format="message",
        )
        if llm_response.status_code == 200:
            response = llm_response.output.choices[0].message.content
    if not response:
        response = _openai_chat(prompt)
    parsed = _parse_qwen_json(response) if response else None
    normalized = _normalize_search_parse(parsed, anonymized_query)
    return _restore_mapping_in_obj(normalized, mapping)


def _openai_embedding(text: str) -> Optional[List[float]]:
    model = LLM_EMBED_MODEL or "text-embedding-3-small"
    payload = {"model": model, "input": text}
    data = _openai_request("/v1/embeddings", payload)
    if not data:
        return None
    try:
        return data["data"][0]["embedding"]
    except (KeyError, IndexError, TypeError):
        return None


def analyze_note(
    content: str,
    categories: Optional[List[str]] = None,
    use_ai: bool = False,
) -> Dict[str, Any]:
    use_llm = _llm_allowed(use_ai)
    dashscope_ready = _dashscope_ready() if use_llm else False
    logger.info(
        "AI analyze_note start provider=%s ai_enabled=%s dashscope_ready=%s base_url=%s has_key=%s has_dashscope=%s",
        LLM_PROVIDER,
        use_llm,
        dashscope_ready,
        bool(LLM_API_BASE_URL),
        bool(LLM_API_KEY),
        HAS_DASHSCOPE,
    )
    category_options = _normalize_category_options(categories)
    category_hint = json.dumps(category_options)
    if dashscope_ready:
        prompt = (
            "Analyze the note and respond in JSON with keys: "
            "short_title, title, category, tags, summary, entities, sensitivity. "
            f"Category must be one of {category_hint}. "
            f"short_title must be <= {SHORT_TITLE_MAX_LEN} characters."
        )
        response = dashscope.Generation.call(
            model=LLM_CHAT_MODEL or "qwen-plus",
            prompt=f"{prompt}\n\nNote:\n{content}\n",
            result_format="message",
        )
        if response.status_code == 200:
            raw = response.output.choices[0].message.content
            parsed = _parse_qwen_json(raw)
            if parsed:
                logger.info("AI analyze_note: dashscope success")
                return parsed
            logger.info("AI analyze_note: dashscope response unparseable")

    prompt = (
        "Analyze the note and respond in JSON with keys: "
        "short_title, title, category, tags, summary, entities, sensitivity. "
        f"Category must be one of {category_hint}. "
        f"short_title must be <= {SHORT_TITLE_MAX_LEN} characters."
    )
    if use_llm:
        response = _openai_chat(f"{prompt}\n\nNote:\n{content}\n")
        if response:
            parsed = _parse_qwen_json(response)
            if parsed:
                logger.info("AI analyze_note: openai-compatible success")
                return parsed
            logger.info("AI analyze_note: openai-compatible response unparseable")

    logger.info("AI analyze_note: fallback to heuristic")
    category = _heuristic_category(content, categories=category_options)
    return {
        "short_title": _heuristic_short_title(content),
        "title": _heuristic_title(content),
        "category": category,
        "tags": _heuristic_tags(content, category),
        "summary": _heuristic_summary(content),
        "entities": extract_entities(content),
        "sensitivity": "high" if detect_sensitive(content) else "low",
    }


def get_embedding(
    text: str,
    already_anonymized: bool = False,
    use_ai: bool = False,
) -> Optional[List[float]]:
    if not _llm_allowed(use_ai):
        return None
    embedding_text = text
    if not already_anonymized:
        embedding_text, _ = anonymize_sensitive_data(text)
    if _dashscope_ready():
        response = dashscope.TextEmbedding.call(
            model=LLM_EMBED_MODEL or dashscope.TextEmbedding.Models.text_embedding_v1,
            input=embedding_text,
        )
        if response.status_code == 200:
            output = getattr(response, "output", None) or response.get("output")
            embeddings = None
            if isinstance(output, dict):
                embeddings = output.get("embeddings")
            else:
                embeddings = getattr(output, "embeddings", None)
            if embeddings:
                first = embeddings[0]
                if isinstance(first, dict):
                    return first.get("embedding")
                return getattr(first, "embedding", None)
    return _openai_embedding(embedding_text)


def summarize_notes(notes: List[str], days: int, use_ai: bool = False) -> str:
    if not notes:
        return "No notes found for the selected period."
    if not _llm_allowed(use_ai):
        joined_original = "\n".join(notes)
        return f"Summary ({days} days): " + (joined_original[:400] + "...")
    mapping: Dict[str, str] = {}
    anonymized_notes: List[str] = []
    for note in notes:
        anonymized_note, note_mapping = anonymize_sensitive_data(note)
        anonymized_notes.append(anonymized_note)
        mapping.update(note_mapping)
    joined = "\n".join(anonymized_notes)
    joined_original = "\n".join(notes)
    if _dashscope_ready():
        prompt = (
            f"Summarize these notes from the last {days} days in 5 bullet points.\n\n"
            f"{joined}"
        )
        response = dashscope.Generation.call(
            model=LLM_CHAT_MODEL or "qwen-plus",
            prompt=prompt,
            result_format="message",
        )
        if response.status_code == 200:
            return restore_sensitive_data(response.output.choices[0].message.content.strip(), mapping)
    response = _openai_chat(
        f"Summarize these notes from the last {days} days in 5 bullet points.\n\n{joined}"
    )
    if response:
        return restore_sensitive_data(response, mapping)
    return f"Summary ({days} days): " + (joined_original[:400] + "...")


def answer_question(question: str, notes: List[str], use_ai: bool = False) -> str:
    if not notes:
        return "No matching notes found."
    if not _llm_allowed(use_ai):
        return notes[0][:200]
    mapping: Dict[str, str] = {}
    anonymized_question, question_mapping = anonymize_sensitive_data(question)
    mapping.update(question_mapping)
    anonymized_notes: List[str] = []
    for note in notes:
        anonymized_note, note_mapping = anonymize_sensitive_data(note)
        anonymized_notes.append(anonymized_note)
        mapping.update(note_mapping)
    if _dashscope_ready():
        prompt = (
            "Answer the question using the notes.\n"
            f"Question: {anonymized_question}\nNotes:\n{anonymized_notes}"
        )
        response = dashscope.Generation.call(
            model=LLM_CHAT_MODEL or "qwen-plus",
            prompt=prompt,
            result_format="message",
        )
        if response.status_code == 200:
            return restore_sensitive_data(response.output.choices[0].message.content.strip(), mapping)
    response = _openai_chat(
        "Answer the question using the notes.\n"
        f"Question: {anonymized_question}\nNotes:\n{anonymized_notes}"
    )
    if response:
        return restore_sensitive_data(response, mapping)
    return notes[0][:200]


def generate_taxonomy_suggestion(micro_clusters: List[Dict[str, Any]], use_ai: bool = False) -> Dict[str, Any]:
    """
    Takes a list of micro-clusters (id, representative_titles) and asks LLM to organize them into Categories -> Folders.
    """
    if not _llm_allowed(use_ai):
        return {"error": "AI not enabled"}

    # Format the input for LLM
    cluster_text = json.dumps(micro_clusters, ensure_ascii=False, indent=2)
    
    prompt = (
        "You are an expert knowledge organizer. I have grouped a user's notes into small 'micro-clusters' based on similarity. "
        "Your task is to organize these micro-clusters into a clean, logical directory structure (Category -> Folder Paths). "
        "Rules:\n"
        "1. Create 5-10 top-level Categories (e.g., 'Work', 'Personal', 'Tech', 'Learning').\n"
        "2. Inside each Category, create Folder paths that group related micro-clusters. Folder paths can be multi-level, using '/' "
        "as the path separator (no spaces around '/'). Example: 'Ops | 运维/Monitoring | 监控'.\n"
        "3. Assign EVERY micro-cluster_id to exactly one Folder path.\n"
        "4. Use bilingual names for Categories and every Folder level in the format 'English | 中文'. Do NOT use '/' inside bilingual "
        "names; reserve '/' only for folder path separators.\n"
        "5. Return ONLY valid JSON matching this schema:\n"
        "{\n"
        "  \"categories\": [\n"
        "    {\n"
        "      \"name\": \"Category Name | 分类名称\",\n"
        "      \"folders\": [\n"
        "        {\n"
        "          \"name\": \"Folder Path (e.g. Ops | 运维/Monitoring | 监控)\",\n"
        "          \"cluster_ids\": [1, 5, 12]  // The IDs of micro-clusters that belong here\n"
        "        }\n"
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        f"Micro-clusters:\n{cluster_text}"
    )

    if _dashscope_ready():
        response = dashscope.Generation.call(
            model=LLM_CHAT_MODEL or "qwen-plus",
            prompt=prompt,
            result_format="message",
        )
        if response.status_code == 200:
            content = response.output.choices[0].message.content
            return _parse_qwen_json(content) or {"error": "Failed to parse LLM response"}

    response_content = _openai_chat(prompt)
    if response_content:
        return _parse_qwen_json(response_content) or {"error": "Failed to parse LLM response"}
        
    return {"error": "LLM request failed"}
