# node-steam-mobile-confirmations
A pure JS library for accepting mobile confirmations. This is a better, more updated version of [GaletskyIvan's older module](https://github.com/GaletskyIvan/steamcommunity-mobile-confirmations).

**Currently a work-in-progress.**

## Functionality
This will aim to:

* Fetch mobile confirmations
* Accept / Deny confirmations
* Accept / Deny multi-confirmations
* ...have good documentation

## Installation
In the near future, you'll be able to do this:
`npm install steam-mobile-confirmations`

## Usage
Instantiate a SteamMobileConfirmations object, with the required defaults (keep reading for more detail):
```js
var SteamMobileConfirmations = require('steam-mobile-confirmations');
var steamConfirmations = new SteamMobileConfirmations({
  steamId: steamId64,
  identitySecret: identitySecret
});
```

Obtain session information with [node-steam](https://github.com/seishun/node-steam) and its plugin [steam-weblogon](https://github.com/Alex7Kom/node-steam-weblogon)

## Examples
Coming soon.

## Methods
The `options` param of all methods is an object. All callbacks are supplied with `Error` as the first argument, or `null` if no errors occurred.

## constructor(options)
This sets up all final values, and should only be called **once**.

Options:
* `steamId` is a valid SteamID64
* `identitySecret` is the secret key used for generating confirmation codes. (_not_ the once used for generating login codes)
* `deviceId` (optional) is the device id used for all calls. Starts with `android:` - one will be generated if you do not provide one.
* `steamOffset` (optional) is the time offset between you and steam. This is **highly recommended** to be provided, as _not_ providing it can cause avoidable errors. You can find this by running `getTimeOffset()` from the [node-steam-totp](https://github.com/DoctorMcKay/node-steam-totp) module. (Use the returned `offset` value)
* `waitTime` (optional) is how long (in milliseconds) the module will wait if it encounters an error before trying again. (Defaults to `10000`)

### updateCookies(webCookie)
This method updates the current session / cookies currently in use. Run this after the error `needsNewSession` is emitted.

`webCookie` can be obtained using [node-steam](https://github.com/seishun/node-steam) and its plugin [steam-weblogon](https://github.com/Alex7Kom/node-steam-weblogon)

### fetchConfirmations(callback)
Returns all currently outstanding (active) confirmations.

The second argument to `callback` will be an array of [Confirmation](https://github.com/luop90/node-steam-mobile-confirmations/wiki/CConfirmation) objects.

## License
MIT
