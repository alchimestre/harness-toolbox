# envcheck

Validate a `.env` file against a JSON schema.

## Usage

```
npm run check -- .env --schema envcheck.schema.json
npm run check -- .env --strict
npm run validate
```

Schema example:

```json
{ "PORT": { "type": "port", "required": true }, "MODE": { "type": "enum", "values": ["dev", "prod"] } }
```

| Option | Meaning |
|---|---|
| `--schema <file>` | Schema to validate against (default `envcheck.schema.json`) |
| `--strict` | Treat warnings as errors |

Exit codes: `0` valid, `1` invalid, `2` bad usage.

## Library

```js
import { validate } from 'envcheck';
```

## Development

```
npm test
```
