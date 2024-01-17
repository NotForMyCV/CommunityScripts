const stashListener = new EventTarget();

const {
    fetch: originalFetch
} = window;

window.fetch = async (...args) => {
    let [resource, config] = args;
    // request interceptor here
    const response = await originalFetch(resource, config);
    // response interceptor here
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1 && resource.endsWith('/graphql')) {
        try {
            const data = await response.clone().json();
            stashListener.dispatchEvent(new CustomEvent('response', {
                'detail': data
            }));
        } catch (e) {

        }
    }
    return response;
};

class Logger {
    constructor(enabled) {
        this.enabled = enabled;
    }
    debug() {
        if (!this.enabled) return;
        console.debug(...arguments);
    }
}


class Stash extends EventTarget {
    constructor({
        pageUrlCheckInterval = 100,
        detectReRenders = false, // detects if .main element is re-rendered. eg: When you are in scenes page and clicking the scenes nav tab the url wont change but the elements are re-rendered, So with this you can listen and alter the elements inside the .main node
        logging = false
    } = {}) {
        super();
        this.log = new Logger(logging);
        this._pageUrlCheckInterval = pageUrlCheckInterval;
        this._detectReRenders = detectReRenders;
        this.fireOnHashChangesToo = true;
        waitForElementQuerySelector(".main > div", () => {
            this.pageURLCheckTimer = setInterval(() => {
                // Loop every 100 ms
                if (this.lastPathStr !== location.pathname || this.lastQueryStr !== location.search || (this.fireOnHashChangesToo && this.lastHashStr !== location.hash) || this.lastHref !== location.href || (!document.querySelector(".main > div[stashUserscriptLibrary]") && this._detectReRenders)) {
                    this.log.debug('[Navigation] Page Changed');
                    this.dispatchEvent(new Event('page'));
                    this.gmMain(false, this.lastHref);
                    this.lastPathStr = location.pathname;
                    this.lastQueryStr = location.search;
                    this.lastHashStr = location.hash;
                    this.lastHref = location.href;
                    waitForElementQuerySelector(".main > div", (query, element) => {
                        if (this._detectReRenders) element.setAttribute("stashUserscriptLibrary", "");
                    }, 10)
                }
            }, this._pageUrlCheckInterval);
        }, 1)
        stashListener.addEventListener('response', (evt) => {
            if (evt.detail.data?.plugins) {
                this.getPluginVersion(evt.detail);
            }
            this.processRemoteScenes(evt.detail);
            this.processScene(evt.detail);
            this.processScenes(evt.detail);
            this.processStudios(evt.detail);
            this.processPerformers(evt.detail);
            this.processApiKey(evt.detail);
            this.dispatchEvent(new CustomEvent('stash:response', {
                'detail': evt.detail
            }));
        });
        stashListener.addEventListener('pluginVersion', (evt) => {
            if (this.pluginVersion !== evt.detail) {
                this.pluginVersion = evt.detail;
                this.dispatchEvent(new CustomEvent('stash:pluginVersion', {
                    'detail': evt.detail
                }));
            }
        });
        this.version = [0, 0, 0];
        this.getVersion();
        this.pluginVersion = null;
        this.getPlugins().then(plugins => this.getPluginVersion(plugins));
        this.visiblePluginTasks = ['Userscript Functions'];
        this.settingsCallbacks = [];
        this.settingsId = 'userscript-settings';
        this.remoteScenes = {};
        this.scenes = {};
        this.studios = {};
        this.performers = {};
        this.userscripts = [];
    }
    async getVersion() {
        const reqData = {
            "operationName": "",
            "variables": {},
            "query": `query version {
    version {
        version
    }
}
`
        };
        const data = await this.callGQL(reqData);
        const versionString = data.data.version.version;
        this.version = versionString.substring(1).split('.').map(o => parseInt(o));
    }
    compareVersion(minVersion) {
        let [currMajor, currMinor, currPatch = 0] = this.version;
        let [minMajor, minMinor, minPatch = 0] = minVersion.split('.').map(i => parseInt(i));
        if (currMajor > minMajor) return 1;
        if (currMajor < minMajor) return -1;
        if (currMinor > minMinor) return 1;
        if (currMinor < minMinor) return -1;
        return 0;

    }
    comparePluginVersion(minPluginVersion) {
        if (!this.pluginVersion) return -1;
        let [currMajor, currMinor, currPatch = 0] = this.pluginVersion.split('.').map(i => parseInt(i));
        let [minMajor, minMinor, minPatch = 0] = minPluginVersion.split('.').map(i => parseInt(i));
        if (currMajor > minMajor) return 1;
        if (currMajor < minMajor) return -1;
        if (currMinor > minMinor) return 1;
        if (currMinor < minMinor) return -1;
        return 0;

    }
    async runPluginTask(pluginId, taskName, args = []) {
        const reqData = {
            "operationName": "RunPluginTask",
            "variables": {
                "plugin_id": pluginId,
                "task_name": taskName,
                "args": args
            },
            "query": "mutation RunPluginTask($plugin_id: ID!, $task_name: String!, $args: [PluginArgInput!]) {\n  runPluginTask(plugin_id: $plugin_id, task_name: $task_name, args: $args)\n}\n"
        };
        return this.callGQL(reqData);
    }
    async callGQL(reqData) {
        const options = {
            method: 'POST',
            body: JSON.stringify(reqData),
            headers: {
                'Content-Type': 'application/json'
            }
        }

        try {
            const res = await window.fetch('/graphql', options);
            this.log.debug(res);
            return res.json();
        } catch (err) {
            console.error(err);
        }
    }
    async getFreeOnesStats(link) {
        try {
            const doc = await fetch(link)
                .then(function(response) {
                    // When the page is loaded convert it to text
                    return response.text()
                })
                .then(function(html) {
                    // Initialize the DOM parser
                    var parser = new DOMParser();

                    // Parse the text
                    var doc = parser.parseFromString(html, "text/html");

                    // You can now even select part of that html as you would in the regular DOM
                    // Example:
                    // var docArticle = doc.querySelector('article').innerHTML;

                    console.log(doc);
                    return doc
                })
                .catch(function(err) {
                    console.log('Failed to fetch page: ', err);
                });

            var data = new Object();
            data.rank = doc.querySelector('rank-chart-button');
            console.log(data.rank);
            data.views = doc.querySelector('.d-none.d-m-flex.flex-column.align-items-center.global-header > div.font-weight-bold').textContent;
            data.votes = '0'
            return JSON.stringify(data);
        } catch (err) {
            console.error(err);
        }
    }
    async getPlugins() {
        const reqData = {
            "operationName": "Plugins",
            "variables": {},
            "query": `query Plugins {
              plugins {
                id
                name
                description
                url
                version
                tasks {
                  name
                  description
                  __typename
                }
                hooks {
                  name
                  description
                  hooks
                }
              }
            }
            `
        };
        return this.callGQL(reqData);
    }
    async getPluginVersion(plugins) {
        let version = null;
        for (const plugin of plugins?.data?.plugins || []) {
            if (plugin.id === 'userscript_functions') {
                version = plugin.version;
            }
        }
        stashListener.dispatchEvent(new CustomEvent('pluginVersion', {
            'detail': version
        }));
    }
    async getStashBoxes() {
        const reqData = {
            "operationName": "Configuration",
            "variables": {},
            "query": `query Configuration {
                        configuration {
                          general {
                            stashBoxes {
                              endpoint
                              api_key
                              name
                            }
                          }
                        }
                      }`
        };
        return this.callGQL(reqData);
    }
    async getApiKey() {
        const reqData = {
            "operationName": "Configuration",
            "variables": {},
            "query": `query Configuration {
                        configuration {
                          general {
                            apiKey
                          }
                        }
                      }`
        };
        return this.callGQL(reqData);
    }
    matchUrl(location, fragment) {
        const regexp = concatRegexp(new RegExp(location.origin), fragment);
        this.log.debug(regexp, location.href.match(regexp));
        return location.href.match(regexp) != null;
    }
    createSettings() {
        waitForElementId('configuration-tabs-tabpane-system', async (elementId, el) => {
            let section;
            if (!document.getElementById(this.settingsId)) {
                section = document.createElement("div");
                section.setAttribute('id', this.settingsId);
                section.classList.add('setting-section');
                section.innerHTML = `<h1>Userscript Settings</h1>`;
                el.appendChild(section);

                const expectedApiKey = (await this.getApiKey())?.data?.configuration?.general?.apiKey || '';
                const expectedUrl = window.location.origin;

                const serverUrlInput = await this.createSystemSettingTextbox(section, 'userscript-section-server-url', 'userscript-server-url', 'Stash Server URL', '', 'Server URL…', true);
                serverUrlInput.addEventListener('change', () => {
                    const value = serverUrlInput.value || '';
                    if (value) {
                        this.updateConfigValueTask('STASH', 'url', value);
                        alert(`Userscripts plugin server URL set to ${value}`);
                    } else {
                        this.getConfigValueTask('STASH', 'url').then(value => {
                            serverUrlInput.value = value;
                        });
                    }
                });
                serverUrlInput.disabled = true;
                serverUrlInput.value = expectedUrl;
                this.getConfigValueTask('STASH', 'url').then(value => {
                    if (value !== expectedUrl) {
                        return this.updateConfigValueTask('STASH', 'url', expectedUrl);
                    }
                });

                const apiKeyInput = await this.createSystemSettingTextbox(section, 'userscript-section-server-apikey', 'userscript-server-apikey', 'Stash API Key', '', 'API Key…', true);
                apiKeyInput.addEventListener('change', () => {
                    const value = apiKeyInput.value || '';
                    this.updateConfigValueTask('STASH', 'api_key', value);
                    if (value) {
                        alert(`Userscripts plugin server api key set to ${value}`);
                    } else {
                        alert(`Userscripts plugin server api key value cleared`);
                    }
                });
                apiKeyInput.disabled = true;
                apiKeyInput.value = expectedApiKey;
                this.getConfigValueTask('STASH', 'api_key').then(value => {
                    if (value !== expectedApiKey) {
                        return this.updateConfigValueTask('STASH', 'api_key', expectedApiKey);
                    }
                });
            } else {
                section = document.getElementById(this.settingsId);
            }

            for (const callback of this.settingsCallbacks) {
                callback(this.settingsId, section);
            }

            if (this.pluginVersion) {
                this.dispatchEvent(new CustomEvent('stash:pluginVersion', {
                    'detail': this.pluginVersion
                }));
            }

        });
    }
    addSystemSetting(callback) {
        const section = document.getElementById(this.settingsId);
        if (section) {
            callback(this.settingsId, section);
        }
        this.settingsCallbacks.push(callback);
    }
    async createSystemSettingCheckbox(containerEl, settingsId, inputId, settingsHeader, settingsSubheader) {
        const section = document.createElement("div");
        section.setAttribute('id', settingsId);
        section.classList.add('card');
        section.style.display = 'none';
        section.innerHTML = `<div class="setting">
        <div>
        <h3>${settingsHeader}</h3>
        <div class="sub-heading">${settingsSubheader}</div>
        </div>
        <div>
        <div class="custom-control custom-switch">
        <input type="checkbox" id="${inputId}" class="custom-control-input">
        <label title="" for="${inputId}" class="custom-control-label"></label>
        </div>
        </div>
        </div>`;
        containerEl.appendChild(section);
        return document.getElementById(inputId);
    }
    async createSystemSettingTextbox(containerEl, settingsId, inputId, settingsHeader, settingsSubheader, placeholder, visible) {
        const section = document.createElement("div");
        section.setAttribute('id', settingsId);
        section.classList.add('card');
        section.style.display = visible ? 'flex' : 'none';
        section.innerHTML = `<div class="setting">
        <div>
        <h3>${settingsHeader}</h3>
        <div class="sub-heading">${settingsSubheader}</div>
        </div>
        <div>
        <div class="flex-grow-1 query-text-field-group">
        <input id="${inputId}" class="bg-secondary text-white border-secondary form-control" placeholder="${placeholder}">
        </div>
        </div>
        </div>`;
        containerEl.appendChild(section);
        return document.getElementById(inputId);
    }
    get serverUrl() {
        return window.location.origin;
    }
    async waitForElement(selector, timeout = null, location = document.body, disconnectOnPageChange = false) {
        return new Promise((resolve) => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector))
            }
    
            const observer = new MutationObserver(async () => {
                if (document.querySelector(selector)) {
                    resolve(document.querySelector(selector))
                    observer.disconnect()
                } else {
                    if (timeout) {
                        async function timeOver() {
                            return new Promise((resolve) => {
                                setTimeout(() => {
                                    observer.disconnect()
                                    resolve(false)
                                }, timeout)
                            })
                        }
                        resolve(await timeOver())
                    }
                }
            })
    
            observer.observe(location, {
                childList: true,
                subtree: true,
            })

const stash = this
            if (disconnectOnPageChange) {
                function disconnect() {
                    observer.disconnect()
                    stash.removeEventListener("page", disconnect)
                }
                this.addEventListener("page", disconnect)
            }
        })
    }
    async waitForElementDeath(selector, location = document.body, disconnectOnPageChange = false) {
        return new Promise((resolve) => {   
            const observer = new MutationObserver(async () => {
                if (!document.querySelector(selector)) {
                    resolve(true)
                    observer.disconnect()
                }
            })
    
            observer.observe(location, {
                childList: true,
                subtree: true,
            })

const stash = this
            if (disconnectOnPageChange) {
                function disconnect() {
                    observer.disconnect()
                    stash.removeEventListener("page", disconnect)
                }
                this.addEventListener("page", disconnect)
            }
        })
    }
    async _listenForNonPageChanges({selector = "", location = document.body, listenType = "", event = "", eventMessage = "", isRecursive = false, reRunGmMain = false, condition = () => true, listenDefaultTab = true, callback = () => {}} = {}){
        if (isRecursive) return
        if (listenType === "tabs") {
            const locationElement = await this.waitForElement(location, 10000, document.body, true)
            const stash = this
            let previousEvent = ""
            function listenForTabClicks(domEvent) {
                const clickedChild = domEvent.target ? domEvent.target : domEvent;
                if(!clickedChild.classList?.contains("nav-link")) return
                const tagName = clickedChild.getAttribute("data-rb-event-key")
                const parentEvent = tagName.split("-")[0]
                const childEvent = tagName.split("-").slice(1, -1).join("-")
                event = `page:${parentEvent}:${childEvent}`
                if (previousEvent === event || !condition()) return
                previousEvent = event
                stash.log.debug("[Navigation] " + `${parentEvent[0].toUpperCase() + parentEvent.slice(1)} Page - ${childEvent[0].toUpperCase() + childEvent.slice(1)}`);
                stash.dispatchEvent(new Event(event));
            }
            if (listenDefaultTab) listenForTabClicks(locationElement.querySelector(".nav-link.active"))
            locationElement.addEventListener("click", listenForTabClicks);
            function removeEventListenerOnPageChange() {
                locationElement.removeEventListener("click", listenForTabClicks)
                stash.removeEventListener("page", removeEventListenerOnPageChange)
            }
            stash.addEventListener("page", removeEventListenerOnPageChange)
        } else if (await this.waitForElement(selector, null, location, true)) {
            this.log.debug("[Navigation] " + eventMessage);
            this.dispatchEvent(new Event(event));
            if (await this.waitForElementDeath(selector, location, true)) {
                if (this.lastPathStr === window.location.pathname && !reRunGmMain) {
                    this._listenForNonPageChanges({selector: selector, event: event, eventMessage: eventMessage})
                } else if (this.lastPathStr === window.location.pathname && reRunGmMain)  {
                    this.gmMain(true, this.lastHref)
                }
            }
        }
    callback()
    }
    gmMain(isRecursive = false, lastHref) {
        const location = window.location;
        this.log.debug(URL, window.location);

        // Run parent page specific functions
        // detect performer edit page
        if (this.matchUrl(location, /\/performers\/\d+/)) {
            if(!new RegExp(/\/performers\/\d+/).test(this.lastHref)){
                this.log.debug('[Navigation] Performer Page');
                this.processTagger();
                this.dispatchEvent(new Event('page:performer'));
            }

            this._listenForNonPageChanges({selector: "#performer-edit", event: "page:performer:edit", eventMessage: "Performer Page - Edit", reRunGmMain: true, callback: () => {
                if (this._detectReRenders) {
                    this.log.debug('[Navigation] Performer Page');
                    this.dispatchEvent(new Event('page:performer'));  
                }
            }})
        }
        // detect studio edit page
        else if (this.matchUrl(location, /\/studios\/\d+/)) {
            if(!new RegExp(/\/studios\/\d+/).test(this.lastHref)){
                this.log.debug('[Navigation] Studio Page');
                this.processTagger();
                this.dispatchEvent(new Event('page:studio'));
            }

            this._listenForNonPageChanges({selector: "#studio-edit", event: "page:studio:edit", eventMessage: "Studio Page - Edit", reRunGmMain: true, callback: () => {
                if (this._detectReRenders) {
                    this.log.debug('[Navigation] Studio Page');
                    this.dispatchEvent(new Event('page:studio'));    
                }
            }})
        }
        // detect tag edit page
        else if (this.matchUrl(location, /\/tags\/\d+/)) {
            if(!new RegExp(/\/tags\/\d+/).test(this.lastHref)){
                this.log.debug('[Navigation] Tag Page');
                this.processTagger();
                this.dispatchEvent(new Event('page:tag'));
            }

            this._listenForNonPageChanges({selector: "#tag-edit", event: "page:tag:edit", eventMessage: "Tag Page - Edit", reRunGmMain: true, callback: () => {
                if (this._detectReRenders) {
                    this.log.debug('[Navigation] Tag Page');
                    this.dispatchEvent(new Event('page:tag'));  
                }
            }})
        }

        // markers page
        if (this.matchUrl(location, /\/scenes\/markers/)) {
            this.log.debug('[Navigation] Markers Page');
            this.dispatchEvent(new Event('page:markers'));
        }
        // create scene page
        else if (this.matchUrl(location, /\/scenes\/new/)) {
            this.log.debug('[Navigation] Create Scene Page');
            this.dispatchEvent(new Event('page:scene:new'));
        }
        // scene page
        else if (this.matchUrl(location, /\/scenes\/\d+/)) {
            this.log.debug('[Navigation] Scene Page');
            this.dispatchEvent(new Event('page:scene'));
            
            this._listenForNonPageChanges({
                location: ".scene-tabs .nav-tabs",
                listenType: "tabs",
                isRecursive: isRecursive
            })
        }
        // scenes page
        else if (this.matchUrl(location, /\/scenes\?/)) {
            this.log.debug('[Navigation] Scenes Page');
            this.processTagger();
            this.dispatchEvent(new Event('page:scenes'));
        }

        // image page
        else if (this.matchUrl(location, /\/images\/\d+/)) {
            this.log.debug('[Navigation] Image Page');
            this.dispatchEvent(new Event('page:image'));

            this._listenForNonPageChanges({
                location: ".image-tabs .nav-tabs",
                listenType: "tabs",
                isRecursive: isRecursive
            })
        }
        // images page
        else if (this.matchUrl(location, /\/images\?/)) {
            this.log.debug('[Navigation] Images Page');
            this.dispatchEvent(new Event('page:images'));
        }

        // movie scenes page
        else if (this.matchUrl(location, /\/movies\/\d+\?/)) {
            this.log.debug('[Navigation] Movie Page - Scenes');
            this.processTagger();
            this.dispatchEvent(new Event('page:movie:scenes'));
        }
        // movie page
        else if (this.matchUrl(location, /\/movies\/\d+/)) {
            this.log.debug('[Navigation] Movie Page');
            this.dispatchEvent(new Event('page:movie'));
        }
        // movies page
        else if (this.matchUrl(location, /\/movies\?/)) {
            this.log.debug('[Navigation] Movies Page');
            this.dispatchEvent(new Event('page:movies'));
        }

                // create gallery page
                else if (this.matchUrl(location, /\/galleries\/new/)) {
                    this.log.debug('[Navigation] Create Gallery Page');
                    this.dispatchEvent(new Event('page:gallery:new'));
                }
        // gallery add page
        else if (this.matchUrl(location, /\/galleries\/\d+\/add/)) {
            if(!new RegExp(/\/galleries\/\d+/).test(lastHref)){
                this.log.debug('[Navigation] Gallery Page');
                this.dispatchEvent(new Event('page:gallery'));
                this._listenForNonPageChanges({selector: ".gallery-tabs .nav-tabs .nav-link.active", event: "page:gallery:details", eventMessage: "Gallery Page - Details"})
            }

            this.log.debug('[Navigation] Gallery Page - Add');
            this.dispatchEvent(new Event('page:gallery:add'));  
            
            this._listenForNonPageChanges({
                location: ".gallery-tabs .nav-tabs",
                listenType: "tabs",
                isRecursive: isRecursive,
                listenDefaultTab: false
            })
        }
        // gallery page
        else if (this.matchUrl(location, /\/galleries\/\d+/)) {
            if(!new RegExp(/\/galleries\/\d+/).test(lastHref)){
                this.log.debug('[Navigation] Gallery Page');
                this.dispatchEvent(new Event('page:gallery'));
                this._listenForNonPageChanges({selector: ".gallery-tabs .nav-tabs .nav-link.active", event: "page:gallery:details", eventMessage: "Gallery Page - Details"})
            }

            this.log.debug('[Navigation] Gallery Page - Images');
            this.dispatchEvent(new Event('page:gallery:images'));

            this._listenForNonPageChanges({
                location: ".gallery-tabs .nav-tabs",
                listenType: "tabs",
                isRecursive: isRecursive,
                listenDefaultTab: false
            })
        }
        // galleries page
        else if (this.matchUrl(location, /\/galleries\?/)) {
            this.log.debug('[Navigation] Galleries Page');
            this.dispatchEvent(new Event('page:galleries'));
        }

        // performer galleries page
        else if (this.matchUrl(location, /\/performers\/\d+\/galleries/)) {
            this.log.debug('[Navigation] Performer Page - Galleries');
            this.dispatchEvent(new Event('page:performer:galleries'));
        }
        // performer images page
        else if (this.matchUrl(location, /\/performers\/\d+\/images/)) {
            this.log.debug('[Navigation] Performer Page - Images');
            this.dispatchEvent(new Event('page:performer:images'));
        }
        // performer movies page
        else if (this.matchUrl(location, /\/performers\/\d+\/movies/)) {
            this.log.debug('[Navigation] Performer Page - Movies');
            this.dispatchEvent(new Event('page:performer:movies'));
        }
        // performer appearswith page
        else if (this.matchUrl(location, /\/performers\/\d+\/appearswith/)) {
            this.log.debug('[Navigation] Performer Page - Appears With');
            this.processTagger();
            this.dispatchEvent(new Event('page:performer:appearswith'));
        }
        // create performer page
        else if (this.matchUrl(location, /\/performers\/new/)) {
            this.log.debug('[Navigation] Create Performer Page');
            this.dispatchEvent(new Event('page:performer:new'));
        }
        // performer scenes page
        else if (this.matchUrl(location, /\/performers\/\d+\?/)) {
            this.log.debug('[Navigation] Performer Page - Scenes');
            this.dispatchEvent(new Event('page:performer:scenes'));
        }
        // performers page
        else if (this.matchUrl(location, /\/performers\?/)) {
            this.log.debug('[Navigation] Performers Page');
            this.dispatchEvent(new Event('page:performers'));
        }

        // studio galleries page
        else if (this.matchUrl(location, /\/studios\/\d+\/galleries/)) {
            this.log.debug('[Navigation] Studio Page - Galleries');
            this.dispatchEvent(new Event('page:studio:galleries'));
        }
        // studio images page
        else if (this.matchUrl(location, /\/studios\/\d+\/images/)) {
            this.log.debug('[Navigation] Studio Page - Images');
            this.dispatchEvent(new Event('page:studio:images'));
        }
        // studio performers page
        else if (this.matchUrl(location, /\/studios\/\d+\/performers/)) {
            this.log.debug('[Navigation] Studio Page - Performers');
            this.dispatchEvent(new Event('page:studio:performers'));
        }
        // studio movies page
        else if (this.matchUrl(location, /\/studios\/\d+\/movies/)) {
            this.log.debug('[Navigation] Studio Page - Movies');
            this.dispatchEvent(new Event('page:studio:movies'));
        }
        // studio childstudios page
        else if (this.matchUrl(location, /\/studios\/\d+\/childstudios/)) {
            this.log.debug('[Navigation] Studio Page - Child Studios');
            this.dispatchEvent(new Event('page:studio:childstudios'));
        }
        // create studio page
        else if (this.matchUrl(location, /\/studios\/new/)) {
            this.log.debug('[Navigation] Create Studio Page');
            this.dispatchEvent(new Event('page:studio:new'));
        }
        // studio scenes page
        else if (this.matchUrl(location, /\/studios\/\d+\?/)) {
            this.log.debug('[Navigation] Studio Page - Scenes');
            this.dispatchEvent(new Event('page:studio:scenes'));
        }
        // studios page
        else if (this.matchUrl(location, /\/studios\?/)) {
            this.log.debug('[Navigation] Studios Page');
            this.dispatchEvent(new Event('page:studios'));
        }

        // tag galleries page
        else if (this.matchUrl(location, /\/tags\/\d+\/galleries/)) {
            this.log.debug('[Navigation] Tag Page - Galleries');
            this.dispatchEvent(new Event('page:tag:galleries'));
        }
        // tag images page
        else if (this.matchUrl(location, /\/tags\/\d+\/images/)) {
            this.log.debug('[Navigation] Tag Page - Images');
            this.dispatchEvent(new Event('page:tag:images'));
        }
        // tag markers page
        else if (this.matchUrl(location, /\/tags\/\d+\/markers/)) {
            this.log.debug('[Navigation] Tag Page - Markers');
            this.dispatchEvent(new Event('page:tag:markers'));
        }
        // tag performers page
        else if (this.matchUrl(location, /\/tags\/\d+\/performers/)) {
            this.log.debug('[Navigation] Tag Page - Performers');
            this.dispatchEvent(new Event('page:tag:performers'));
        }
        // create tag page
        else if (this.matchUrl(location, /\/tags\/new/)) {
            this.log.debug('[Navigation] Create Tag Page');
            this.dispatchEvent(new Event('page:tag:new'));
        }
        // tag scenes page
        else if (this.matchUrl(location, /\/tags\/\d+\?/)) {
            this.log.debug('[Navigation] Tag Page - Scenes');
            this.dispatchEvent(new Event('page:tag:scenes'));
        }
        // tags page
        else if (this.matchUrl(location, /\/tags\?/)) {
            this.log.debug('[Navigation] Tags Page');
            this.dispatchEvent(new Event('page:tags'));
        }

        // settings page tasks tab
        else if (this.matchUrl(location, /\/settings\?tab=tasks/)) {
            if(!new RegExp(/\/settings\?/).test(this.lastHref)){
                this.log.debug('[Navigation] Settings Page');
                this.dispatchEvent(new Event('page:settings'));
                this.hidePluginTasks();
            }

            this.log.debug('[Navigation] Settings Page Tasks Tab');
            this.dispatchEvent(new Event('page:settings:tasks'));
        }
        // settings page library tab
        else if (this.matchUrl(location, /\/settings\?tab=library/)) {
            this.log.debug('[Navigation] Settings Page Library Tab');
            this.dispatchEvent(new Event('page:settings:library'));
        }
        // settings page interface tab
        else if (this.matchUrl(location, /\/settings\?tab=interface/)) {
            this.log.debug('[Navigation] Settings Page Interface Tab');
            this.dispatchEvent(new Event('page:settings:interface'));
        }
        // settings page security tab
        else if (this.matchUrl(location, /\/settings\?tab=security/)) {
            this.log.debug('[Navigation] Settings Page Security Tab');
            this.dispatchEvent(new Event('page:settings:security'));
        }
        // settings page metadata providers tab
        else if (this.matchUrl(location, /\/settings\?tab=metadata-providers/)) {
            this.log.debug('[Navigation] Settings Page Metadata Providers Tab');
            this.dispatchEvent(new Event('page:settings:metadata-providers'));
        }
        // settings page services tab
        else if (this.matchUrl(location, /\/settings\?tab=services/)) {
            this.log.debug('[Navigation] Settings Page Services Tab');
            this.dispatchEvent(new Event('page:settings:services'));
        }
        // settings page system tab
        else if (this.matchUrl(location, /\/settings\?tab=system/)) {
            this.log.debug('[Navigation] Settings Page System Tab');
            this.createSettings();
            this.dispatchEvent(new Event('page:settings:system'));
        }
        // settings page plugins tab
        else if (this.matchUrl(location, /\/settings\?tab=plugins/)) {
            this.log.debug('[Navigation] Settings Page Plugins Tab');
            this.dispatchEvent(new Event('page:settings:plugins'));
        }
        // settings page logs tab
        else if (this.matchUrl(location, /\/settings\?tab=logs/)) {
            this.log.debug('[Navigation] Settings Page Logs Tab');
            this.dispatchEvent(new Event('page:settings:logs'));
        }
        // settings page tools tab
        else if (this.matchUrl(location, /\/settings\?tab=tools/)) {
            this.log.debug('[Navigation] Settings Page Tools Tab');
            this.dispatchEvent(new Event('page:settings:tools'));
        }
        // settings page changelog tab
        else if (this.matchUrl(location, /\/settings\?tab=changelog/)) {
            this.log.debug('[Navigation] Settings Page Changelog Tab');
            this.dispatchEvent(new Event('page:settings:changelog'));
        }
        // settings page about tab
        else if (this.matchUrl(location, /\/settings\?tab=about/)) {
            this.log.debug('[Navigation] Settings Page About Tab');
            this.dispatchEvent(new Event('page:settings:about'));
        }

        // stats page
        else if (this.matchUrl(location, /\/stats/)) {
            this.log.debug('[Navigation] Stats Page');
            this.dispatchEvent(new Event('page:stats'));
        }

        // home page
        else if (this.matchUrl(location, /\/$/)) {
            this.log.debug('[Navigation] Home Page');
            this.dispatchEvent(new Event('page:home'));

            this._listenForNonPageChanges({selector: ".recommendations-container-edit", event: "page:home:edit", eventMessage: "Home Page - Edit", reRunGmMain: true})
        }
    }
    addEventListeners(events, callback, ...options) {
        events.forEach((event) => {
            this.addEventListener(event, callback, ...options);
        });
    }
    hidePluginTasks() {
        // hide userscript functions plugin tasks
        waitForElementByXpath("//div[@id='tasks-panel']//h3[text()='Userscript Functions']/ancestor::div[contains(@class, 'setting-group')]", (elementId, el) => {
            const tasks = el.querySelectorAll('.setting');
            for (const task of tasks) {
                const taskName = task.querySelector('h3').innerText;
                task.classList.add(this.visiblePluginTasks.indexOf(taskName) === -1 ? 'd-none' : 'd-flex');
                this.dispatchEvent(new CustomEvent('stash:plugin:task', {
                    'detail': {
                        taskName,
                        task
                    }
                }));
            }
        });
    }
    async updateConfigValueTask(sectionKey, propName, value) {
        return this.runPluginTask("userscript_functions", "Update Config Value", [{
            "key": "section_key",
            "value": {
                "str": sectionKey
            }
        }, {
            "key": "prop_name",
            "value": {
                "str": propName
            }
        }, {
            "key": "value",
            "value": {
                "str": value
            }
        }]);
    }
    async getConfigValueTask(sectionKey, propName) {
        await this.runPluginTask("userscript_functions", "Get Config Value", [{
            "key": "section_key",
            "value": {
                "str": sectionKey
            }
        }, {
            "key": "prop_name",
            "value": {
                "str": propName
            }
        }]);

        // poll logs until plugin task output appears
        const prefix = `[Plugin / Userscript Functions] get_config_value: [${sectionKey}][${propName}] =`;
        return this.pollLogsForMessage(prefix);
    }
    async pollLogsForMessage(prefix) {
        const reqTime = Date.now();
        const reqData = {
            "variables": {},
            "query": `query Logs {
                        logs {
                            time
                            level
                            message
                        }
                    }`
        };
        await new Promise(r => setTimeout(r, 500));
        let retries = 0;
        while (true) {
            const delay = 2 ** retries * 100;
            await new Promise(r => setTimeout(r, delay));
            retries++;

            const logs = await this.callGQL(reqData);
            for (const log of logs.data.logs) {
                const logTime = Date.parse(log.time);
                if (logTime > reqTime && log.message.startsWith(prefix)) {
                    return log.message.replace(prefix, '').trim();
                }
            }

            if (retries >= 5) {
                throw `Poll logs failed for message: ${prefix}`;
            }
        }
    }
    processTagger() {
        waitForElementByXpath("//button[text()='Scrape All']", (xpath, el) => {
            this.dispatchEvent(new CustomEvent('tagger', {
                'detail': el
            }));

            const searchItemContainer = document.querySelector('.tagger-container').lastChild;

            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node?.classList?.contains('entity-name') && node.innerText.startsWith('Performer:')) {
                            this.dispatchEvent(new CustomEvent('tagger:mutation:add:remoteperformer', {
                                'detail': {
                                    node,
                                    mutation
                                }
                            }));
                        } else if (node?.classList?.contains('entity-name') && node.innerText.startsWith('Studio:')) {
                            this.dispatchEvent(new CustomEvent('tagger:mutation:add:remotestudio', {
                                'detail': {
                                    node,
                                    mutation
                                }
                            }));
                        } else if (node.tagName === 'SPAN' && node.innerText.startsWith('Matched:')) {
                            this.dispatchEvent(new CustomEvent('tagger:mutation:add:local', {
                                'detail': {
                                    node,
                                    mutation
                                }
                            }));
                        } else if (node.tagName === 'UL') {
                            this.dispatchEvent(new CustomEvent('tagger:mutation:add:container', {
                                'detail': {
                                    node,
                                    mutation
                                }
                            }));
                        } else if (node?.classList?.contains('col-lg-6')) {
                            this.dispatchEvent(new CustomEvent('tagger:mutation:add:subcontainer', {
                                'detail': {
                                    node,
                                    mutation
                                }
                            }));
                        } else if (node.tagName === 'H5') { // scene date
                            this.dispatchEvent(new CustomEvent('tagger:mutation:add:date', {
                                'detail': {
                                    node,
                                    mutation
                                }
                            }));
                        } else if (node.tagName === 'DIV' && node?.classList?.contains('d-flex') && node?.classList?.contains('flex-column')) { // scene stashid, url, details
                            this.dispatchEvent(new CustomEvent('tagger:mutation:add:detailscontainer', {
                                'detail': {
                                    node,
                                    mutation
                                }
                            }));
                        } else {
                            this.dispatchEvent(new CustomEvent('tagger:mutation:add:other', {
                                'detail': {
                                    node,
                                    mutation
                                }
                            }));
                        }
                    });
                });
                this.dispatchEvent(new CustomEvent('tagger:mutations:searchitems', {
                    'detail': mutations
                }));
            });
            observer.observe(searchItemContainer, {
                childList: true,
                subtree: true
            });

            const taggerContainerHeader = document.querySelector('.tagger-container-header');
            const taggerContainerHeaderObserver = new MutationObserver(mutations => {
                this.dispatchEvent(new CustomEvent('tagger:mutations:header', {
                    'detail': mutations
                }));
            });
            taggerContainerHeaderObserver.observe(taggerContainerHeader, {
                childList: true,
                subtree: true
            });

            for (const searchItem of document.querySelectorAll('.search-item')) {
                this.dispatchEvent(new CustomEvent('tagger:searchitem', {
                    'detail': searchItem
                }));
            }

            if (!document.getElementById('progress-bar')) {
                const progressBar = createElementFromHTML(`<div id="progress-bar" class="progress"><div class="progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div></div>`);
                progressBar.classList.add('progress');
                progressBar.style.display = 'none';
                taggerContainerHeader.appendChild(progressBar);
            }
        });
        waitForElementByXpath("//div[@class='tagger-container-header']/div/div[@class='row']/h4[text()='Configuration']", (xpath, el) => {
            this.dispatchEvent(new CustomEvent('tagger:configuration', {
                'detail': el
            }));
        });
    }
    setProgress(value) {
        const progressBar = document.getElementById('progress-bar');
        if (progressBar) {
            progressBar.firstChild.style.width = value + '%';
            progressBar.style.display = (value <= 0 || value > 100) ? 'none' : 'flex';
        }
    }
    processRemoteScenes(data) {
        if (data.data?.scrapeMultiScenes) {
            for (const matchResults of data.data.scrapeMultiScenes) {
                for (const scene of matchResults) {
                    this.remoteScenes[scene.remote_site_id] = scene;
                }
            }
        } else if (data.data?.scrapeSingleScene) {
            for (const scene of data.data.scrapeSingleScene) {
                this.remoteScenes[scene.remote_site_id] = scene;
            }
        }
    }
    processScene(data) {
        if (data.data.findScene) {
            this.scenes[data.data.findScene.id] = data.data.findScene;
        }
    }
    processScenes(data) {
        if (data.data.findScenes?.scenes) {
            for (const scene of data.data.findScenes.scenes) {
                this.scenes[scene.id] = scene;
            }
        }
    }
    processStudios(data) {
        if (data.data.findStudios?.studios) {
            for (const studio of data.data.findStudios.studios) {
                this.studios[studio.id] = studio;
            }
        }
    }
    processPerformers(data) {
        if (data.data.findPerformers?.performers) {
            for (const performer of data.data.findPerformers.performers) {
                this.performers[performer.id] = performer;
            }
        }
    }
    processApiKey(data) {
        if (data.data.generateAPIKey != null && this.pluginVersion) {
            this.updateConfigValueTask('STASH', 'api_key', data.data.generateAPIKey);
        }
    }
    parseSearchItem(searchItem) {
        const urlNode = searchItem.querySelector('a.scene-link');
        const url = new URL(urlNode.href);
        const id = url.pathname.replace('/scenes/', '');
        const data = this.scenes[id];
        const nameNode = searchItem.querySelector('a.scene-link > div.TruncatedText');
        const name = nameNode.innerText;
        const queryInput = searchItem.querySelector('input.text-input');
        const performerNodes = searchItem.querySelectorAll('.performer-tag-container');

        return {
            urlNode,
            url,
            id,
            data,
            nameNode,
            name,
            queryInput,
            performerNodes
        }
    }
    parseSearchResultItem(searchResultItem) {
        const remoteUrlNode = searchResultItem.querySelector('.scene-details .optional-field .optional-field-content a');
        const remoteId = remoteUrlNode?.href.split('/').pop();
        const remoteUrl = remoteUrlNode?.href ? new URL(remoteUrlNode.href) : null;
        const remoteData = this.remoteScenes[remoteId];

        const sceneDetailNodes = searchResultItem.querySelectorAll('.scene-details .optional-field .optional-field-content');
        let urlNode = null;
        let detailsNode = null;
        for (const sceneDetailNode of sceneDetailNodes) {
            if (sceneDetailNode.innerText.startsWith('http') && (remoteUrlNode?.href !== sceneDetailNode.innerText)) {
                urlNode = sceneDetailNode;
            } else if (!sceneDetailNode.innerText.startsWith('http')) {
                detailsNode = sceneDetailNode;
            }
        }

        const imageNode = searchResultItem.querySelector('.scene-image-container .optional-field .optional-field-content');

        const metadataNode = searchResultItem.querySelector('.scene-metadata');
        const titleNode = metadataNode.querySelector('h4 .optional-field .optional-field-content');
        const codeAndDateNodes = metadataNode.querySelectorAll('h5 .optional-field .optional-field-content');
        let codeNode = null;
        let dateNode = null;
        for (const node of codeAndDateNodes) {
            if (node.textContent.includes('-')) {
                dateNode = node;
            } else {
                codeNode = node;
            }
        }

        const entityNodes = searchResultItem.querySelectorAll('.entity-name');
        let studioNode = null;
        const performerNodes = [];
        for (const entityNode of entityNodes) {
            if (entityNode.innerText.startsWith('Studio:')) {
                studioNode = entityNode;
            } else if (entityNode.innerText.startsWith('Performer:')) {
                performerNodes.push(entityNode);
            }
        }

        const matchNodes = searchResultItem.querySelectorAll('div.col-lg-6 div.mt-2 div.row.no-gutters.my-2 span.ml-auto');
        const matches = []
        for (const matchNode of matchNodes) {
            let matchType = null;
            const entityNode = matchNode.parentElement.querySelector('.entity-name');

            const matchName = matchNode.querySelector('.optional-field-content b').innerText;
            const remoteName = entityNode.querySelector('b').innerText;

            let data;
            if (entityNode.innerText.startsWith('Performer:')) {
                matchType = 'performer';
                if (remoteData) {
                    data = remoteData.performers.find(performer => performer.name === remoteName);
                }
            } else if (entityNode.innerText.startsWith('Studio:')) {
                matchType = 'studio';
                if (remoteData) {
                    data = remoteData.studio
                }
            }

            matches.push({
                matchType,
                matchNode,
                entityNode,
                matchName,
                remoteName,
                data
            });
        }

        return {
            remoteUrlNode,
            remoteId,
            remoteUrl,
            remoteData,
            urlNode,
            detailsNode,
            imageNode,
            titleNode,
            codeNode,
            dateNode,
            studioNode,
            performerNodes,
            matches
        }
    }
}

window.stash = new Stash();

function waitForElementQuerySelector(query, callBack, time) {
    time = (typeof time !== 'undefined') ? time : 100;
    window.setTimeout(() => {
        const element = document.querySelector(query);
        if (element) {
            callBack(query, element);
        } else {
            waitForElementQuerySelector(query, callBack, time);
        }
    }, time);
}

function waitForElementClass(elementId, callBack, time) {
    time = (typeof time !== 'undefined') ? time : 100;
    window.setTimeout(() => {
        const element = document.getElementsByClassName(elementId);
        if (element.length > 0) {
            callBack(elementId, element);
        } else {
            waitForElementClass(elementId, callBack, time);
        }
    }, time);
}

function waitForElementId(elementId, callBack, time) {
    time = (typeof time !== 'undefined') ? time : 100;
    window.setTimeout(() => {
        const element = document.getElementById(elementId);
        if (element != null) {
            callBack(elementId, element);
        } else {
            waitForElementId(elementId, callBack, time);
        }
    }, time);
}

function waitForElementByXpath(xpath, callBack, time) {
    time = (typeof time !== 'undefined') ? time : 100;
    window.setTimeout(() => {
        const element = getElementByXpath(xpath);
        if (element) {
            callBack(xpath, element);
        } else {
            waitForElementByXpath(xpath, callBack, time);
        }
    }, time);
}

function getElementByXpath(xpath, contextNode) {
    return document.evaluate(xpath, contextNode || document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

function createElementFromHTML(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();

    // Change this to div.childNodes to support multiple top-level nodes.
    return div.firstChild;
}

function getElementByXpath(xpath, contextNode) {
    return document.evaluate(xpath, contextNode || document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

function getElementsByXpath(xpath, contextNode) {
    return document.evaluate(xpath, contextNode || document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
}

function getClosestAncestor(el, selector, stopSelector) {
    let retval = null;
    while (el) {
        if (el.matches(selector)) {
            retval = el;
            break
        } else if (stopSelector && el.matches(stopSelector)) {
            break
        }
        el = el.parentElement;
    }
    return retval;
}

function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value').set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value').set;

    if (valueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
    } else {
        valueSetter.call(element, value);
    }
}

function updateTextInput(element, value) {
    setNativeValue(element, value);
    element.dispatchEvent(new Event('input', {
        bubbles: true
    }));
}

function concatRegexp(reg, exp) {
    let flags = reg.flags + exp.flags;
    flags = Array.from(new Set(flags.split(''))).join();
    return new RegExp(reg.source + exp.source, flags);
}

function sortElementChildren(node) {
    const items = node.childNodes;
    const itemsArr = [];
    for (const i in items) {
        if (items[i].nodeType == Node.ELEMENT_NODE) { // get rid of the whitespace text nodes
            itemsArr.push(items[i]);
        }
    }

    itemsArr.sort((a, b) => {
        return a.innerHTML == b.innerHTML ?
            0 :
            (a.innerHTML > b.innerHTML ? 1 : -1);
    });

    for (let i = 0; i < itemsArr.length; i++) {
        node.appendChild(itemsArr[i]);
    }
}

function xPathResultToArray(result) {
    let node = null;
    const nodes = [];
    while (node = result.iterateNext()) {
        nodes.push(node);
    }
    return nodes;
}

function createStatElement(container, title, heading) {
    const statEl = document.createElement('div');
    statEl.classList.add('stats-element');
    container.appendChild(statEl);

    const statTitle = document.createElement('p');
    statTitle.classList.add('title');
    statTitle.innerText = title;
    statEl.appendChild(statTitle);

    const statHeading = document.createElement('p');
    statHeading.classList.add('heading');
    statHeading.innerText = heading;
    statEl.appendChild(statHeading);
}

const reloadImg = url =>
    fetch(url, {
        cache: 'reload',
        mode: 'no-cors'
    })
    .then(() => document.body.querySelectorAll(`img[src='${url}']`)
        .forEach(img => img.src = url));
