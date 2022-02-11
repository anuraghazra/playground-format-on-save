import type { PlaygroundPlugin, PluginUtils } from "./vendor/playground";

import prettier from "prettier/standalone";
import tsPlugin from "prettier/parser-typescript";

const lskey = "tsplay-plugin-format-on-save";
const configkey = "tsplay-plugin-prettier-config";

const store = (key: string, data: any) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.log(err);
  }
};
const get = (key: string) => {
  try {
    return JSON.parse(window.localStorage.getItem(key));
  } catch (err) {
    console.log(err);
  }
};

const makeUI = (container: HTMLDivElement) => {
  const text = document.createElement("span");
  const textbox_label = document.createElement("p");
  const textbox = document.createElement("textarea");
  const label = document.createElement("label");
  const input = document.createElement("input");
  textbox.style.width = "90%";
  textbox.style.minHeight = "150px";
  text.textContent = " Toggle format on save";
  textbox_label.textContent = " Prettier config (json):";
  input.type = "checkbox";
  label.appendChild(input);
  label.appendChild(text);
  container.appendChild(label);
  container.appendChild(textbox_label);
  container.appendChild(textbox);

  return { input, textbox };
};

const makePlugin = (utils: PluginUtils) => {
  const customPlugin: PlaygroundPlugin = {
    id: "format-on-save",
    displayName: "Format On Save",
    didMount: (sandbox, container) => {
      const ds = utils.createDesignSystem(container);
      let shouldFormatOnSave = get(lskey) || false;
      let prettierConfig = get(configkey) || {};

      // Bootstrap UI
      const { input, textbox } = makeUI(container);
      input.checked = shouldFormatOnSave;
      textbox.value = JSON.stringify(prettierConfig, null, 2);
      input.onchange = () => {
        shouldFormatOnSave = input.checked;
        store(lskey, shouldFormatOnSave);
      };
      textbox.onchange = (e) => {
        // @ts-ignore
        prettierConfig = JSON.parse(e.target.value);
        store(configkey, prettierConfig);
      };

      const handleSave = (e: KeyboardEvent) => {
        if (!shouldFormatOnSave) return;
        const isSKey = e.key == "s";
        const isSavePressed = (isSKey && e.metaKey) || (isSKey && e.ctrlKey);
        if (!isSavePressed) return;
        e.preventDefault();
        try {
          const source = sandbox.getText();
          const cursorPosOld = sandbox.editor.getPosition();
          const prettySource = prettier.formatWithCursor(source, {
            cursorOffset: cursorPosOld.column * cursorPosOld.lineNumber,
            parser: "typescript",
            plugins: [tsPlugin],
            ...prettierConfig,
          });

          sandbox.editor.pushUndoStop();
          const fullRange = sandbox.editor.getModel().getFullModelRange();
          sandbox.editor.executeEdits(null, [
            {
              text: prettySource.formatted,
              range: fullRange,
            },
          ]);
          const cursorPosNew = sandbox.editor.getPosition();
          // recalculate cursor position
          // TODO: improve it
          const lineDelta = cursorPosOld.lineNumber - cursorPosNew.lineNumber;
          const position = {
            lineNumber: cursorPosNew.lineNumber,
            column: cursorPosNew.column - lineDelta,
          };
          sandbox.editor.setPosition(position);
          sandbox.editor.pushUndoStop();
        } catch (e) {
          ds.p(`[Prettier] failed to format: ${e.message}`);
        }
      };
      window.addEventListener("keydown", handleSave);
    },

    modelChangedDebounce: async (_sandbox, _model) => {},
    didUnmount: () => {},
  };

  return customPlugin;
};

export default makePlugin;
