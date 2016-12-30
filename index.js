'use strict';

const fs = require('fs');
const request = require('request');
const Cheerio = require('cheerio');
const SteamTotp = require('steam-totp');
const _ = require('underscore');
const events = require('events');

const Confirmation = require('./classes/Confirmation.js');

class SteamCommunityMobileConfirmations {
  constructor(data) {
    // Initialize values from the data object
    this.steamId = data.steamId;
    this.identitySecret = data.identitySecret;
    this.deviceId = data.deviceId || SteamTotp.getDeviceID(this.steamId);
    this.offset = data.steamOffset || 0;
    this.timeBetweenCalls = data.waitTime || 10000;

    // Initialize all others
    this.STEAM_BASE = 'https://steamcommunity.com'
    this.has429Error = false;
    this.needsNewSession = false;
    this.errorEvent = new events.EventEmitter;
    this._requestJar = request.jar();
    this._request = request.defaults({ jar: this._requestJar });

    // Set each cookie NOM NOM
    for (let cookie of data.webCookie) {
      this._requestJar.setCookie(request.cookie(cookie), this.STEAM_BASE);
    }
  }

  /**
   * Updates the cookies if the session expired
   * @param  {Object} webCookie The new set of cookies
   * @return {void}
   */
  updateCookies(webCookie) {
    for (let cookie of webCookie) {
      this._requestJar.setCookie(request.cookie(cookie), this.STEAM_BASE);
    }

    this.needsNewSession = false;
  }

  /**
   * Grabs all confirmations
   * @param {Function} callback The function callback'd.
   * @return {void}
   */
  fetchConfirmations(callback) {
    let url = `${this.STEAM_BASE}/mobileconf/conf?${this._generateQueryString('conf')}`;

    this.request(url, 'GET', (err, response, body) => {
      let error = checkResponse(err, response, body);

      if (error) {
        callback(error, null);
        return;
      }

      // Parse our confirmations
      let confirmations = [];
      let finalConfirmations = [];
      let $ = Cheerio.load(body);
      fs.writeFileSync(`output.html`, body);

      // Go through each confirmation, and generate a new Confirmation object
      $('[data-confid]').each((index, element) => {
        let $confirmation = $(element);

        confirmations.push(new Confirmation({
          id: $confirmation.data('confid'),
          type: $confirmation.data('type'),
          key: $confirmation.data('key'),
          tradeId: $confirmation.data('creator')
        }));
      });

      callback(null, confirmations);
    });
  }

  /**
   * Sends the response to accept the confirmation
   * @param  {Confirmation} confirmation The Confirmation we are responding too (or Confirmation[])
   * @param  {Function}     callback
   * @param {boolean}       secondTry Whether or not we try to accept again. undefined for false
   * @return {void}
   */
  acceptConfirmation(confirmation, callback, secondTry) {
    var handleConfirmationResponse = (error, result) => {
      if (error || !result.success) {
        console.log('Failed to accept first time: ' + error || result);

        if (secondTry == undefined) {
          setTimeout(() => {
            this.acceptConfirmation(confirmation, callback, true);
          }, this.timeBetweenCalls);

          return;
        }

        callback(error, false);
        return;
      }

      callback(null, true);
    };

    if (Array.isArray(confirmation)) {
      this._sendMultiConfirmationResponse(confirmation, 'allow', handleConfirmationResponse);
    } else {
      this._sendConfirmationResponse(confirmation, 'allow', handleConfirmationResponse);
    }
  }

  /**
   * This retrieves the tradeId from a confirmation
   * @param  {Confirmation}   confirmation The specific confirmation
   * @param  {Function}       callback
   * @return {void}
   */
  getConfirmationTradeId(confirmation, callback) {
    this._getConfirmationDetails(confirmation, (error, body) => {
      if (error) {
        callback(error, confirmation);
        return;
      }

      let $ = Cheerio.load(body);
      fs.writeFileSync(`output-details.html`, body);

      let tradeId = $('div.tradeoffer').attr('id').match(/\d+/i);

      callback(null, tradeId);
    });
  }

  /**
   * Our custom request call, applies headers where needed / etc
   * @param  {String}   url      The URL to be requested
   * @param  {String}   method   The HTTP method (GET, POST, PUT, DELETE)
   * @param  {Object}   form     (Optional) A form to be sent, only works if method is POST
   * @param  {Function} callback
   * @return {void}
   */
  request(url, method, form, callback) {
    if (this.needsNewSession) {
      console.error('Waiting for new session before calling request!');

      setTimeout(() => {
        this.request(url, method, form, callback);
      }, this.timeBetweenCalls);
      return;
    }

    if (typeof form === 'function') {
      callback = form;
      form = {};
    }

    // Generate some headers to simulate a real application
    let headers = {
      'accept': 'text/javascript, text/html, application/xml, text/xml, */*',
      'user-agent': 'Mozilla/5.0 (Linux; U; Android 4.1.1; en-us; Google Nexus 4 - 4.1.1 - API 16 - 768x1280 Build/JRO03S) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30'
    };

    this._request({
      method: method,
      url: url,
      headers: headers,
      form: form
    }, (error, response, body) => {
      if (error) {
        console.error(error);
        console.error(response.statusCode);
        console.error(body);

        this.needsNewSession = true;
        this.errorEvent.emit('needsNewSession');

        setTimeout(() => {
          this.request(url, method, form, callback);
        }, this.timeBetweenCalls);
        return;
      } else if (response.statusCode == 429) {
        // If we have a 429 error, because volvo hates us, wait for 3x the normal wait, and then try again.
        this.has429Error = true;

        setTimeout(() => {
          this.request(url, method, form, callback);
        }, this.timeBetweenCalls * 3);
        return;
      }

      callback(error, response, body);
    });
  }

  /**
   * Sends a confirmation response
   * @param  {Confirmation} confirmation The Confirmation we are responding too
   * @param  {String}       operation    allow / cancel
   * @param  {Function}     callback     The function callback'd
   * @return {void}
   */
  _sendConfirmationResponse(confirmation, operation, callback) {
    let url = `${this.STEAM_BASE}/mobileconf/ajaxop?op=${operation}&${this._generateQueryString(operation)}&cid=${confirmation.id}&ck=${confirmation.key}`;

    this.request(url, 'GET', (err, response, body) => {
      let error = checkResponse(err, response, body);

      if (error) {
        callback(error, null);
        return;
      }

      try {
        let result = JSON.parse(body);
        callback(null, result);
      } catch (e) {
        callback(new Error('Failed to parse body'), null);
      }
    });
  }

  /**
   * Allows multiple confirmations to be sent at once (either all accept, or all deny)
   * @param  {Array}    confirmations The confirmation array
   * @param  {String}   operation     accept / deny
   * @param  {Function} callback
   * @return {void}
   */
  _sendMultiConfirmationResponse(confirmations, operation, callback) {
    let url = `${this.STEAM_BASE}/mobileconf/multiajaxop`;
    let queryVariables = this._generateQueryVariables(operation);

    // Initialize our form
    let form = {
      op: operation,
      cid: [],
      ck: []
    };

    // Move our query variables to the new form
    _.extend(form, queryVariables);

    // Loop over each confirmation, adding each id / key to their respective array
    for (let confirmation of confirmations) {
      form.cid.push(confirmation.id);
      form.ck.push(confirmation.key);
    }

    this.request(url, 'POST', form, (err, response, body) => {
      let error = checkResponse(err, response, body);

      if (error) {
        callback(error, null);
        return;
      }

      try {
        let result = JSON.parse(body);
        callback(null, result);
      } catch (e) {
        callback(new Error('Failed to parse body'), null);
      }
    });
  }

  /**
   * Gets the confirmation details
   * @param  {Confirmation} confirmation The Confirmation we care about
   * @param {Function} callback
   * @return {void}
   */
  _getConfirmationDetails(confirmation, callback) {
    let url = `${this.STEAM_BASE}/mobileconf/details/${confirmation.id}?${this._generateQueryString('details')}`;

    this.request(url, 'GET', (err, response, body) => {
      let error = checkResponse(err, response, body);

      if (error) {
        callback(error, null);
        return;
      }

      callback(null, body);
    });
  }

  /**
   * Generates the HTTP query string, to be prepended to all GET requests
   * @param  {String} tag The action. "conf" to load the confirmations page, "details" to load details about a trade, "allow" to confirm a trade, "cancel" to cancel it.
   * @return {String}     The generated string
   */
  _generateQueryString(tag) {
    let queryVariables = this._generateQueryVariables(tag);
    let queryString = '';

    // Generate our string
    for (let name in queryVariables) {
      queryString += `${name}=${queryVariables[name]}&`;
    }

    // Remove trailing &
    queryString = queryString.slice(0, -1);

    return queryString;
  }

  /**
   * Actually generate the needed variables
   * @param  {String} tag Action tag
   * @return {Object}     The variables, zipped together a nice & neat object!
   */
  _generateQueryVariables(tag) {
    let time = SteamTotp.time(this.steamOffset);

    let result = {
      p: this.deviceId,
      a: this.steamId,
      k: SteamTotp.generateConfirmationKey(this.identitySecret, time, tag),
      t: time,
      m: 'android',
      tag: tag
    };

    return result;
  }
}

/**
 * Checks the HTTP response
 * @param  {Error} error    An HTTP error
 * @param  {Object} response The HTTP response object
 * @param  {Object} body     The HTTP body
 * @return {Error}          An error, if one exists (null otherwise)
 */
function checkResponse(error, response, body) {
  if (error || response.statusCode != 200) {
    return error || new Error(response.statusCode);
  }

  if (!body) {
    return new Error('Invalid response body');
  }

  return null;
}

module.exports = SteamCommunityMobileConfirmations;
