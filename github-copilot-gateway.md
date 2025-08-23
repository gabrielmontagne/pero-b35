# GitHub Copilot Gateway Integration

## Goal
Add GitHub Copilot as a gateway option for pero.

## Research Results ✅

### API Format & Endpoints
- ✅ **Endpoint**: `https://api.githubcopilot.com/chat/completions`  
- ✅ **Format**: OpenAI-compatible (confirmed by reverse-engineering projects)
- ✅ **Tools**: Supports function calling
- ❌ **Official API**: No public API for chat completions

### Authentication Mystery Solved 🔍
**opencode.ai approach:**
- ✅ Has experimental Copilot support working
- ✅ **No auth in opencode.json** - confirmed by inspection
- ✅ **Hidden auth locations**: Uses standard GitHub token storage:
  - System keyring (preferred, encrypted)
  - `~/.config/gh/hosts.yml` (GitHub CLI tokens)  
  - `$GITHUB_TOKEN` environment variable

### Implementation Options

**Option 1: Proxy Approach (Recommended SSS)**
- Use `ericc-ch/copilot-api` as local proxy (`npx copilot-api --port 4141`)
- Add `copilot-proxy` gateway pointing to `http://localhost:4141`
- Proxy handles all OAuth complexity

**Option 2: Direct Integration**  
- Extract tokens from same locations as opencode
- Check: keyring → gh CLI → env var
- More complex but cleaner UX

**Option 3: Manual Token**
- Document that users set `$GITHUB_TOKEN` 
- Simplest implementation

## Next Steps
- [ ] Test ericc-ch/copilot-api proxy on machine with Copilot access
- [ ] Prototype gateway integration with proxy approach
- [ ] Consider token extraction methods from opencode's approach

## Notes
- Tools support: ✅ confirmed  
- Streaming: not needed initially
- Rate limiting: read the 400s
- Manual `.env` fits existing patterns