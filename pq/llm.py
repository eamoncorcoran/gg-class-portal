# One structured call to a model, for marking. Claude when the Anthropic key works; OpenAI otherwise
# (Eamon's call on 8 Nov 2026 while both Anthropic keys on this Mac were revoked).
# Keys come from the environment; a .env beside this file is read as a convenience for local runs.
import json, os

import anthropic
import requests
from pydantic import BaseModel

ROOT = os.path.dirname(os.path.abspath(__file__))
if os.path.exists(os.path.join(ROOT, '.env')):
    for line in open(os.path.join(ROOT, '.env')):
        k, _, v = line.strip().partition('=')
        if k and v and k not in os.environ:
            os.environ[k] = v.strip().strip('"\'')

OPENAI_MODEL = 'gpt-5.5'
_claude, _claude_ok = None, None
# When Claude refused a call outright (no credit left on the account, overloaded), OpenAI marks
# instead for this long before Claude is tried again. 19 November 2026: every mark on the live
# site failed for an afternoon because the Anthropic balance had run out and nothing stepped in.
CLAUDE_REST_SECONDS = 600
_claude_resting_until = 0.0

def claude():
    """The Anthropic client, or None while the key is rejected (checked once per process) or Claude is resting."""
    global _claude, _claude_ok
    import time
    if time.time() < _claude_resting_until:
        return None
    if _claude_ok is None:
        _claude = anthropic.Anthropic(default_headers={'anthropic-workspace-id': os.environ['ANTHROPIC_WORKSPACE_ID']}
                                      if os.environ.get('ANTHROPIC_WORKSPACE_ID') else None)
        try:
            _claude.models.retrieve('claude-opus-5-5')
            _claude_ok = True
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError, TypeError):
            _claude_ok = False
    return _claude if _claude_ok else None

def _strict(schema):
    """OpenAI strict mode: every object closed and every property required."""
    if isinstance(schema, dict):
        if schema.get('type') == 'object':
            schema['additionalProperties'] = False
            schema['required'] = list(schema.get('properties', {}))
        for v in schema.values():
            _strict(v)
    elif isinstance(schema, list):
        for v in schema:
            _strict(v)
    return schema

def structured(system: str, user: str, model_cls: type[BaseModel], cache_prefix: str = '') -> tuple[BaseModel, str]:
    """Returns (parsed result, provider name). cache_prefix is stable context worth caching (a passage)."""
    c = claude()
    if c:
        sys_blocks = [{'type': 'text', 'text': system}]
        if cache_prefix:
            sys_blocks.append({'type': 'text', 'text': cache_prefix, 'cache_control': {'type': 'ephemeral'}})
        try:
            resp = c.beta.messages.parse(
                model='claude-opus-5-5', max_tokens=16000, output_config={'effort': 'medium'},
                betas=['server-side-fallback-2026-07-01'], fallbacks='default',
                system=sys_blocks, messages=[{'role': 'user', 'content': user}], output_format=model_cls)
        except (anthropic.BadRequestError, anthropic.RateLimitError, anthropic.InternalServerError, anthropic.APIConnectionError) as ex:
            # Not this request's fault (no credit, overloaded, unreachable): let OpenAI mark, and rest Claude.
            global _claude_resting_until
            import time
            _claude_resting_until = time.time() + CLAUDE_REST_SECONDS
            print(f'claude unavailable, marking with openai for {CLAUDE_REST_SECONDS}s: {str(ex)[:160]}', flush=True)
            if not os.environ.get('OPENAI_API_KEY'):
                raise
        else:
            if resp.stop_reason == 'refusal' or resp.parsed_output is None:
                raise RuntimeError(f'marker declined ({resp.stop_reason})')
            return resp.parsed_output, 'claude'
    schema = _strict(model_cls.model_json_schema())
    for d in schema.get('$defs', {}).values():
        _strict(d)
    r = requests.post('https://api.openai.com/v1/chat/completions', timeout=180,
                      headers={'Authorization': f"Bearer {os.environ['OPENAI_API_KEY']}"},
                      json={'model': OPENAI_MODEL, 'reasoning_effort': 'low',
                            'messages': [{'role': 'system', 'content': system + ('\n\n' + cache_prefix if cache_prefix else '')},
                                         {'role': 'user', 'content': user}],
                            'response_format': {'type': 'json_schema',
                                                'json_schema': {'name': model_cls.__name__, 'strict': True, 'schema': schema}}})
    if r.status_code != 200:
        raise RuntimeError(f'OpenAI {r.status_code}: {r.text[:200]}')
    msg = r.json()['choices'][0]['message']
    if msg.get('refusal'):
        raise RuntimeError('marker declined')
    return model_cls.model_validate(json.loads(msg['content'])), 'openai'
