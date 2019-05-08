'use strict';

const http = require('http');
const urllib = require('url');

var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    homebridge.registerAccessory('homebridge-switchboxd', 'SwitchboxD', SwitchboxD);
};

class SwitchboxD {

    constructor(log, config) {
        this.services = [];
        this.log = log;
        this.name = config.name || 'SwitchboxD';
        this.names = config.names || ['Switch 0', 'Switch 1'];
        this.ip = config.ip;
        this.notification_port = config.notification_port || null;
        this.current_status = null;
        this.status_callbacks = new Array();
        this.current_status_time = null;
        this.status_timer = null;

        if (!this.ip) {
            throw new Error('You must provide an ip address of the switch.');
        }

        if (this.notification_port) {
            this.log.debug(`Starting status notification server at port ${this.notification_port}`);
            this.notification_server = http.createServer((req, res) => {
                this.log.debug(`Handling notification payload`);
                this.serverHandler(req, res);
            });
            this.notification_server.listen(this.notification_port, () => {
                this.log.debug(`Started status notification server at port ${this.notification_port}`);
            });
        }

        this.log.debug(`Names: ${this.names[0]}, ${this.names[1]}`);

        // HOMEKIT SERVICES
        this.serviceInfo = new Service.AccessoryInformation();
        this.serviceInfo
            .setCharacteristic(Characteristic.Manufacturer, 'Blebox')
            .setCharacteristic(Characteristic.Model, 'SwitchboxD 2.0');
        this.services.push(this.serviceInfo);

        this.switch1Service = new Service.Switch(this.names[0], 'relay0');
        this.switch1Service.getCharacteristic(Characteristic.On)
            .on('set', this.setSwitch1.bind(this))
            .on('get', this.getSwitch1.bind(this));
        this.services.push(this.switch1Service);

        this.switch2Service = new Service.Switch(this.names[1], 'relay1');
        this.switch2Service.getCharacteristic(Characteristic.On)
            .on('set', this.setSwitch2.bind(this))
            .on('get', this.getSwitch2.bind(this));
        this.services.push(this.switch2Service);

        this.updateStatus(true);
    }

    serverHandler(req, res) {
        if (req.url.startsWith('/status')) {
            this.log.debug(`Status update notification received`);
            this.updateStatus(true);
            res.writeHead(200);
            res.end('OK');

            return;
        }

        res.writeHead(404);
        res.end('Not Found');
    }

    getServices () {
        return this.services;
    }

    setSwitch1 (state, callback) {
        this.setRelayState(0, state, callback);
    }

    getSwitch1 (callback) {
        this.getRelayState(0, callback);
    }

    setSwitch2 (state, callback) {
        this.setRelayState(1, state, callback);
    }

    getSwitch2 (callback) {
        this.getRelayState(1, callback);
    }

    setRelayState(relay, state, callback) {
        var log = this.log;
        log.debug('switching');

        this.sendJSONRequest('http://' + this.ip + `/s/${relay}/${state ? 1 : 0}`, 'GET')
            .then((response) => {
                if (response) {
                    this.current_status = response;
                    this.current_status_time = Date.now();
                }
                this.updateStatus(false);
                callback();
            })
            .catch((e) => {
                log.error(`Failed to switch: ${e}`);
                setTimeout(() => { callback(e); this.updateStatus(true); }, 3000);
            });
    }

    getRelayState(relay, callback) {
        this.getStatus(false, (error) => {
            if (error) {
                callback(error);
                return;
            }

            callback(null, this.current_status.relays[relay].state === 1);
        });
    }

    updateStatus(forced = false) {
        this.log.debug('Updating switch status');
        this.getStatus(forced, (err) => {
            if (err) {
                return;
            }

            this.log.debug('Updating characteristics');

            this.switch1Service.updateCharacteristic(Characteristic.On, this.current_status.relays[0].state === 1);
            this.switch2Service.updateCharacteristic(Characteristic.On, this.current_status.relays[1].state === 1);
        });
    }

    updateInterval() {
        return 60000; // slow update interval for idle states
    }

    clearUpdateTimer() {
        clearTimeout(this.status_timer);
    }

    setupUpdateTimer() {
        if (this.notification_server) { // don't schedule status updates for polling - we have them pushed by the switch
            return;
        }
        this.status_timer = setTimeout(() => { this.updateStatus(true); }, this.updateInterval());
    }

    getStatus(forced, callback) {
        if (this.status_callbacks.length > 0) {
            this.log.debug('Pushing status callback to queue - updating');
            this.status_callbacks.push(callback);
            return;
        }

        const now = Date.now();

        if (!forced && this.current_status !== null && 
            this.current_status_time !== null && 
            (now - this.current_status_time < this.updateInterval())) {
                this.log.debug('Returning cached status');
                callback(null);
                return;
        }

        this.clearUpdateTimer();

        this.log.debug(`Executing update, forced: ${forced}`);
        this.status_callbacks.push(callback);

        this.sendJSONRequest('http://' + this.ip + '/api/relay/state')
            .then((response) => {
                this.log.debug('Done executing update');
                this.current_status = response;
                this.current_status_time = Date.now();
                const callbacks = this.status_callbacks;
                this.status_callbacks = new Array();

                this.log.debug(`Calling ${callbacks.length} queued callbacks`);
                callbacks.forEach((element) => {
                    element(null, response);
                });
                this.setupUpdateTimer();
            })
            .catch((e) => {
                this.log.error(`Error parsing current status info: ${e}`);
                const callbacks = this.status_callbacks;
                this.status_callbacks = new Array();

                callbacks.forEach((element) => {
                    element(e);
                });

                this.setupUpdateTimer();
            });
    }

    sendJSONRequest (url, method = 'GET', payload = null) {
        return new Promise((resolve, reject) => {

            const components = new urllib.URL(url);

            const options = {
                method: method,
                host: components.hostname,
                port: components.port,
                path: components.pathname,
                protocol: components.protocol,
                headers: {'Content-Type': 'application/json'}
            };
    
            const req = http.request(options, (res) => {
                res.setEncoding('utf8');

                let chunks = '';
                res.on('data', (chunk) => { chunks += chunk; });
                res.on('end', () => {
                    try {
                        this.log.debug(`Raw response: ${chunks}`);
                        const parsed = JSON.parse(chunks);
                        resolve(parsed);
                    } catch(e) {
                        reject(e);
                    }
                });
            });
            req.on('error', (err) => {
                reject(err);
            });

            if (payload) {
                const stringified = JSON.stringify(payload);
                this.log(`sending payload: ${stringified}`);
                req.write(stringified);
            }

            req.end();
        });
    }
}
