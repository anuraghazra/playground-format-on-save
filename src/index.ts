import {
  type PlaygroundPlugin,
  type PluginFactory,
  type PluginUtils,
} from "./vendor/playground";
import { IKeyboardEvent } from "monaco-editor";

import prettier from "prettier/standalone";
import * as prettierPluginTS from "prettier/plugins/typescript";
import * as prettierPluginEstree from "prettier/plugins/estree";

// @ts-ignore - wrong type coming from monaco
const SKeyCode = sandbox.monaco.KeyCode.KeyS;
const lskey = "tsplay-plugin-format-on-save-v2";
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
  const textbox_label = document.createElement("p");
  const textbox = document.createElement("textarea");
  const formatOnSaveText = document.createElement("span");
  const formatOnSaveLabel = document.createElement("label");
  const formatOnSaveToggleInput = document.createElement("input");
  const copyLinkOnSaveText = document.createElement("span");
  const copyLinkOnSaveLabel = document.createElement("label");
  const copyLinkOnSaveInput = document.createElement("input");

  textbox.style.width = "90%";
  textbox.style.minHeight = "150px";
  formatOnSaveText.textContent = " Enable format on save";
  copyLinkOnSaveText.textContent = " Prevent copy link on save";
  textbox_label.textContent = " Prettier config (json):";

  formatOnSaveToggleInput.type = "checkbox";
  formatOnSaveLabel.appendChild(formatOnSaveToggleInput);
  formatOnSaveLabel.appendChild(formatOnSaveText);

  copyLinkOnSaveInput.type = "checkbox";
  copyLinkOnSaveLabel.appendChild(copyLinkOnSaveInput);
  copyLinkOnSaveLabel.appendChild(copyLinkOnSaveText);

  container.appendChild(formatOnSaveLabel);
  container.appendChild(document.createElement("br"));
  container.appendChild(copyLinkOnSaveLabel);
  container.appendChild(textbox_label);
  container.appendChild(textbox);

  return { formatOnSaveToggleInput, copyLinkOnSaveInput, textbox };
};

const modifiedDTSPlugin: PluginFactory = (i, utils) => {
  let codeElement: HTMLElement;
  let shouldPrettyDTS = false;
  const plugin: PlaygroundPlugin = {
    id: "dts",
    displayName: ".D.TS",
    willMount: (sandbox, container) => {
      const { code } = utils.createDesignSystem(container);
      const prettyDTS = () => {
        sandbox.getDTSForCode().then(async (dts) => {
          const prettySource = shouldPrettyDTS
            ? await prettier.format(dts, {
                parser: "typescript",
                plugins: [prettierPluginTS, prettierPluginEstree],
              })
            : dts;
          sandbox.monaco.editor
            .colorize(prettySource, "typescript", {})
            .then((coloredDTS) => {
              codeElement.innerHTML = coloredDTS;
            });
        });
      };
      prettyDTS();

      const prettyDtsText = document.createElement("span");
      const prettyDtsLabel = document.createElement("label");
      const prettyDtsToggleInput = document.createElement("input");

      prettyDtsText.textContent = " Prettify DTS?";
      prettyDtsToggleInput.type = "checkbox";
      prettyDtsLabel.appendChild(prettyDtsToggleInput);
      prettyDtsLabel.appendChild(prettyDtsText);

      prettyDtsToggleInput.onchange = () => {
        shouldPrettyDTS = prettyDtsToggleInput.checked;
        prettyDTS();
      };
      container.appendChild(prettyDtsLabel);
      container.appendChild(document.createElement("br"));
      container.appendChild(document.createElement("br"));

      codeElement = code("");
    },
    modelChanged: (sandbox, model) => {
      sandbox.getDTSForCode().then(async (dts) => {
        const prettySource = shouldPrettyDTS
          ? await prettier.format(dts, {
              parser: "typescript",
              plugins: [prettierPluginTS, prettierPluginEstree],
            })
          : dts;
        sandbox.monaco.editor
          .colorize(prettySource, "typescript", {})
          .then((coloredDTS) => {
            codeElement.innerHTML = coloredDTS;
          });
      });
    },
  };

  return plugin;
};

const makePlugin = (utils: PluginUtils) => {
  // Find and remove showDTSPlugin in order to override it with our own
  const plugins = window.playground.plugins;
  // find showDTSPlugin
  const showDTSPluginIndex = plugins.findIndex((p) => p.id === "dts");
  plugins.splice(showDTSPluginIndex, 1);

  // remove showDTSPlugin tab
  const tabs = window.playground.tabs;
  const showDTSPluginTabIndex = tabs.findIndex(
    (t) => t.getAttribute("id") === "playground-plugin-tab-dts"
  );
  tabs[showDTSPluginTabIndex].remove();
  tabs.splice(showDTSPluginTabIndex, 1);

  // register our plugin
  window.playground.registerPlugin(modifiedDTSPlugin((i) => i, utils));

  const customPlugin: PlaygroundPlugin = {
    id: "format-on-save",
    displayName: "Format On Save",
    didMount: (sandbox, container) => {
      const ds = utils.createDesignSystem(container);
      let pluginConfig = JSON.parse(window.localStorage.getItem(lskey) || "{}");
      let prettierConfig = get(configkey) || {};

      // Bootstrap UI
      const { formatOnSaveToggleInput, copyLinkOnSaveInput, textbox } =
        makeUI(container);
      formatOnSaveToggleInput.checked = pluginConfig.shouldFormatOnSave;
      copyLinkOnSaveInput.checked = pluginConfig.preventCopyLinkOnSave;
      textbox.value = JSON.stringify(prettierConfig, null, 2);

      formatOnSaveToggleInput.onchange = () => {
        pluginConfig.shouldFormatOnSave = formatOnSaveToggleInput.checked;
        store(lskey, pluginConfig);
      };
      copyLinkOnSaveInput.onchange = () => {
        pluginConfig.preventCopyLinkOnSave = copyLinkOnSaveInput.checked;
        store(lskey, pluginConfig);
      };
      textbox.onchange = (e) => {
        // @ts-ignore
        prettierConfig = JSON.parse(e.target.value);
        store(configkey, prettierConfig);
      };

      const handleSave = async (e: IKeyboardEvent) => {
        if (!pluginConfig.shouldFormatOnSave) return;
        const isSKey = e.keyCode === SKeyCode;
        const isSavePressed = (isSKey && e.metaKey) || (isSKey && e.ctrlKey);

        if (!isSavePressed) return;
        e.preventDefault();
        try {
          const source = sandbox.getText();
          const cursorPosOld = sandbox.editor.getPosition();
          const prettySource = await prettier.formatWithCursor(source, {
            cursorOffset: cursorPosOld.column * cursorPosOld.lineNumber,
            parser: "typescript",
            plugins: [prettierPluginTS, prettierPluginEstree],
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

      // Format on save
      sandbox.editor.onKeyDown((e) => handleSave(e));

      // Override the copy command to save the URL to the clipboard
      const originalCopyAction = sandbox.editor.getAction("copy-clipboard");
      sandbox.editor.addAction({
        id: "copy-clipboard",
        label: "Save to clipboard",
        keybindings: [sandbox.monaco.KeyMod.CtrlCmd | SKeyCode],
        contextMenuGroupId: "run",
        contextMenuOrder: 1.5,
        run: () => {
          if (pluginConfig.preventCopyLinkOnSave) {
            // do not copy the code to clipboard but still update the URL
            const newURL = sandbox.createURLQueryWithCompilerOptions(sandbox);
            window.history.replaceState({}, "", newURL);
          } else {
            originalCopyAction.run();
          }
        },
      });
    },

    modelChangedDebounce: async (_sandbox, _model) => {},
    didUnmount: () => {},
  };

  return customPlugin;
};

export default makePlugin;
