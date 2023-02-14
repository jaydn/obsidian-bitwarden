import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { execFile } from 'child_process';
import { clipboard } from 'electron';

interface PasswordManagerSettings {
    passwordManager: string;
    bitwardenBinary: string;
    bitwardenExecTimeout: number,
}

interface State {
    bitwardenSessionToken: string,
}

const AVAILABLE_PASSWORD_MANAGERS = [
    'Bitwarden',
] as const;

const DEFAULT_SETTINGS: PasswordManagerSettings = {
    passwordManager: 'Bitwarden',
    bitwardenBinary: '/usr/bin/bw',
    bitwardenExecTimeout: 10000,
}

export default class MyPlugin extends Plugin {
    settings: PasswordManagerSettings;
    st: State;

    async onload() {
        await this.loadSettings();
        this.st = <State>{};

        this.addSettingTab(new SettingTab(this.app, this));

        this.addCommand({
            id: 'unlock-password-manager',
            name: 'Unlock password manager',
            callback: () => {
                new UnlockModal(this.app, (res) => { this.st.bitwardenSessionToken = res; }).open();
            }
        });

        this.addCommand({
            id: 'lock-password-manager',
            name: 'Lock password manager',
            callback: () => {
                this.st.bitwardenSessionToken = "";
            }
        });


        const retrieveCredsButton = (ev: Event, property: string, source: string) => {
            ev.preventDefault();

            (ev.target as HTMLButtonElement).setAttribute('disabled', '');

            execFile(this.settings.bitwardenBinary,
                ["--raw", "--session", this.st.bitwardenSessionToken, "get", property, source],
                { "timeout": this.settings.bitwardenExecTimeout },
                (error, stdout, stderr) => {
                    if (error != null) {
                        new Notice("Failed to copy: " + stderr)
                    } else {
                        clipboard.writeText(stdout);
                        new Notice("Copied")
                    }
                    (ev.target as HTMLButtonElement).removeAttribute('disabled');
                });
        }


        this.registerMarkdownCodeBlockProcessor("passwordmanager", (source, el, _) => {
            const mainDiv = el.createEl("div", { text: "🔒 " + source, cls: ["PassMgrIntegration-block"] });
            ["Username", "Password", "TOTP"].forEach((credType) => {
                mainDiv.createEl("button", {
                    text: credType,
                    cls: ["mod-cta", "PassMgrIntegration-btn"]
                }).onClickEvent((ev) => {
                    retrieveCredsButton(ev, credType.toLowerCase(), source);
                });
            });
        });


        //  this.registerEditorExtension();
    }

    onunload() {
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class UnlockModal extends Modal {
    result: string;
    onSubmit: (result: string) => void;

    constructor(app: App, onSubmit: (result: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h1", { text: "Unlock Password Manager" });

        new Setting(contentEl)
            .setName("Password")
            .addText((text) =>
                text.onChange((value) => {
                    this.result = value;
                }));

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Submit")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onSubmit(this.result);
                    }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }

}

class SettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl).setName("Password Manager").setDesc("Which password manager are you integrating?").addDropdown((component) => {
            AVAILABLE_PASSWORD_MANAGERS.forEach((pwMgr) => {
                component.addOption(pwMgr.toString(), pwMgr.toString());
            })
        });

        if (this.plugin.settings.passwordManager == 'Bitwarden') {
            new Setting(containerEl)
                .setName("Binary")
                .setDesc("Path to your bitwarden-cli binary")
                .addText(text => text
                    .setPlaceholder("/usr/bin/bw")
                    .setValue(this.plugin.settings.bitwardenBinary)
                    .onChange(async (val) => {
                        this.plugin.settings.bitwardenBinary = val; await this.plugin.saveSettings();
                    })
                );

            new Setting(containerEl)
                .setName("Timeout")
                .setDesc("Timeout of calls to bitwarden-cli binary")
                .addSlider(slider => slider
                    .setLimits(5000, 25000, 1000)
                    .setValue(this.plugin.settings.bitwardenExecTimeout)
                    .onChange(async (val) => {
                        this.plugin.settings.bitwardenExecTimeout = val; await this.plugin.saveSettings();
                    })
                );
        }
    }
}
