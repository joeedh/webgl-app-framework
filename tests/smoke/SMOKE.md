# Smoke checklist (manual)

Manual verification for the web build and Electron build. Automated coverage lives
under `tests/{unit,integration,build}/`; this file is for the things we don't yet
automate (UI clicks, GPU rendering, file picker dialogs).

Run on every release-candidate; not part of CI.

## Web

1. `pnpm install`
2. `pnpm build`
3. `pnpm serv` then open <http://localhost:5007>.
4. Default scene loads (cube visible).
5. Open the addon settings panel. Disable **Mesh Edit**. The toolmode enum should
   shrink. Re-enable.
6. Save (Ctrl+S) the default scene. Reload the page. Open the saved file. Cube and
   any custom-data layers come back intact.
7. Disable **Mesh Edit**, reopen the saved file. Cube should appear as a
   "missing-addon placeholder" but the file must load without throwing.
8. Re-enable **Mesh Edit**. Cube should restore.
9. (After step 7/10 of the plan land.) Install a third-party `.zip` addon from the
   UI; verify it appears and loads.

## Electron

1. `pnpm build`
2. `cd electron && npx electron .`
3. Repeat steps 4–8 from the Web section.
4. Verify that addon installs land in `app.getPath('userData')/addons/` and survive
   relaunch.

Report failures with: the step number, console output (DevTools), and the build
artifact path at the time of failure.
