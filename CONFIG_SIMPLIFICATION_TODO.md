# Configuration Simplification

## Requirements

**Merge user preferences into main config file and eliminate complex versioning.**

Current state: Two separate files (`~/.cui/config.json` + `~/.cui/preferences.json`) with complex JsonFileManager and versioning.
Target state: Single `~/.cui/config.json` with `interface` section, simple field merging on load.

## Implementation Tasks

### 1. **Consolidate Configuration Schema**
- [ ] Add `interface` field to `CUIConfig` containing current `Preferences` (colorScheme, language, notifications)
- [ ] Delete separate preferences types and merge into config types
- [ ] Update `DEFAULT_CONFIG` to include interface defaults

### 2. **Simplify Config Loading Logic** 
- [ ] Replace complex versioning with simple field detection in `ConfigService`
- [ ] On load: if config missing expected fields, merge with defaults and rewrite file
- [ ] Remove `JsonFileManager` dependency - use direct JSON read/write
- [ ] Add `getInterface()` and `updateInterface()` convenience methods

### 3. **Eliminate PreferencesService**
- [ ] Delete `PreferencesService` class entirely
- [ ] Update `NotificationService` to get settings from `ConfigService.getInterface()`
- [ ] Remove `PreferencesService` from `CUIServer` constructor and initialization

### 4. **Update API Contract**
- [ ] Replace `/api/preferences` routes with `/api/config` routes  
- [ ] Support both full config and interface-only endpoints: `GET/PUT /config/interface`
- [ ] Maintain backward compatibility for frontend (same response shape for interface data)

### 5. **Frontend Integration**
- [ ] Update `PreferencesContext` to call new config endpoints
- [ ] Ensure theme switching and preference persistence still work identically
- [ ] No changes needed to user-facing interface behavior

### 6. **Remove Dead Code**
- [ ] Delete: `preferences-service.ts`, `json-file-manager.ts`, `preferences.ts`
- [ ] Delete associated test files
- [ ] Clean up imports across codebase

### 7. **Validation**
- [ ] Verify single config file contains both system and interface settings
- [ ] Confirm theme switching, notifications, and language preferences work
- [ ] Ensure clean config migration from existing two-file setup

## Success Criteria
- Single `~/.cui/config.json` file with `interface` section
- No version migration complexity - just field merging
- All user preferences functionality preserved
- Reduced codebase complexity (~300 lines removed)