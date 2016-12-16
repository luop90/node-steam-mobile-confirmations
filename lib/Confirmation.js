'use strict';

class Confirmation {
  constructor(data) {
    this.key = data.key;
    this.id = data.id;
    this.description = data.description;
    this.tradeId = data.tradeId;
  }
}
