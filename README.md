# homebridge-switchboxd

`homebridge-switchboxd` is a [Homebridge](https://github.com/nfarina/homebridge) plugin you can use to control your Blebox SwitchboxD in-wall switch.

The difference from the more general [homebridge-blebox](https://github.com/Actardnes/homebridge-blebox) plugin is that this one is much more specific, does not do scanning, and allows the SwitchboxD to push the status change to the plugin using an HTTP endpoint set up with a given notification port. To take advantage of it, just set up a `Get URL` relay action with the URL of `http://<homebridge-host-ip>:notification_port/status`, e.g. `http://192.168.0.2:52200/status`. Once pinged, the plugin will fetch current status of the SwitchboxD's relays without constantly polling it.

## Installation

`npm -g install homebridge-switchboxd`

## Configuration

An entry in `config.json` is needed

```
{
    "accessory": "SwitchboxD",
    "name": "<e.g. Porch>",
    "names": ["Switch 0", "Switch 1"],
    "ip": "<switch ip address>",
    "notification_port": 52200
}
```
