# homebridge-switchboxd

`homebridge-switchboxd` is a [Homebridge](https://github.com/nfarina/homebridge) plugin you can use to control your Blebox SwitchboxD in-wall switch, and have it ping the plug-in of the relay state change.

The difference from the more general [homebridge-blebox](https://github.com/Actardnes/homebridge-blebox) plugin is that this one is much more specific, does not do scanning of the whole local network on each homebridge launch, and allows the SwitchboxD to push the status change to the plugin using an HTTP endpoint set up with a given notification port. To take advantage of it, just enable a `Get URL` relay action with the URL of `http://<homebridge-host-ip>:notification_port/status`, e.g. `http://192.168.0.1:52200/status`. Once pinged, the plugin will fetch current status of the SwitchboxD's relays without constantly polling it.

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

## TODO

For now the implementation is a little quick-n-dirty. The accessory will most likely become a platform, and I'll be able to get rid of the `names` setting to read the relay names from device's configuration directly. Also, support for multiple Switchboxes in a single accessory makes sense, thus reducing the number of HTTP push endpoints to one for the whole "fleet".
