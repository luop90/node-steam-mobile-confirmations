'use strict';

/**
 * This class exists solely to have a centralized set of values for each confirmation
 * Hence why there is nothing but a constructor... :D
 */
class Confirmation {
  constructor(data) {
    this.key = data.key;
    this.id = data.id;
    this.type = data.type;
    this.tradeId = data.tradeId;
  }
}

module.exports = Confirmation;
