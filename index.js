// ReSharper disable StringConcatenationToTemplateString
// ReSharper disable ThisInGlobalContext
// ReSharper disable VariableCanBeMadeConst

(function(exports) {
  function getHttpRequest(o) {
    if (typeof o === "function") return o;
    if (o === null) return null;

    if (typeof o === "object") {
      var fn = o.fn;
      var name = o.name;
      if (!fn || !name) return null;

      switch (name.toLowerCase()) {
        case 'jquery':
          return function(options, cb) {
            fn(options).done(function(res) { cb(null, res); }).fail(function(jqXhr, status, err) { cb(err); });
          };
        case 'request':
          return function(options, cb) { fn(options, (err, res, body) => cb(err, body)); };
        case '$http':
          return function(options, cb) {
            fn(options).then(function(res) { cb(null, res); }, function(err) { cb(err); });
          };
        case 'superagent':
          return function(options, cb) {
            fn.get(options.url);
            if (options.headers) fn.set(options.headers);
            fn.end(cb);
          };
        default:
          return null;
      }
    }
    return null;
  }

  exports.createService = function(httpRequest) {
    httpRequest = getHttpRequest(httpRequest);

    function DictionaryApi(createRequestOptions, fetchResult) {
      var self = this instanceof DictionaryApi ? this : Object.create(DictionaryApi.prototype);
      self._createRequestOptions = createRequestOptions;
      self._fetchResult = fetchResult;
      return self;
    }

    DictionaryApi.prototype._parseData = function(data, callback) {
      try {
        var res = typeof data == "string" ? JSON.parse(data) : data;
        callback(null, res);
      } catch (e) {
        callback(e);
      }
    };

    DictionaryApi.prototype.lookup = function(search, callback) {
      var self = this;
      var options = self._createRequestOptions(search);
      return httpRequest(options, function(err, data) {
        if (err) return callback(err);
        return self._parseData(data, function(error, res) {
          if (error) return callback(error);
          return self._fetchResult(res, callback);
        });
      });
    };


    function PearsonDictionaryApi(dictionaryName) {
      var self = this instanceof PearsonDictionaryApi ? this : Object.create(PearsonDictionaryApi.prototype);
      var originalUrl = 'http://api.pearson.com';

      DictionaryApi.call(
        self,
        function(search) {
          return {
            url: originalUrl + '/v2/dictionaries/' + dictionaryName + '/entries?headword=' +
              encodeURIComponent(search)
          };
        },
        function(data, cb) {
          if (data.status !== 200) return cb(new Error(data));
          var results = {
            main: data.results && data.results.map(function(res) {
              return{
                word: res.headword,
                lexicalCategory: res.part_of_speech,
                pronunciations: res.pronunciations && res.pronunciations.map(function(pron) {
                  return {
                    notation: 'IPA',
                    spelling: pron.ipa,
                    audio: pron.audio && pron.audio.map(function(aud) {
                      return {
                        language: aud.lang,
                        url: aud.url && (originalUrl + aud.url)
                      };
                    })
                  };
                }),
                senses: res.senses.map(function(sense) {
                  return {
                    definition: sense.definition,
                    examples: sense.examples && sense.examples.map(function(example) {
                      return example.text;
                    }),
                    gramaticalExamples: sense.gramatical_examples && sense.gramatical_examples.map(function(example) {
                      return {
                        pattern: example.pattern,
                        texts: example.examples && example.examples.map(function(ex) {
                          return ex.text;
                        })
                      };
                    }),
                    gramaticalInfo: sense.gramatical_info && sense.gramatical_info.type
                  };
                })
              };
            })
          };
          return cb(null, results);
        });

      return self;
    }

    PearsonDictionaryApi.prototype = Object.create(DictionaryApi.prototype);
    PearsonDictionaryApi.prototype.constructor = PearsonDictionaryApi;


    function GlosbeDictionaryApi(from, to) {
      var self = this instanceof GlosbeDictionaryApi ? this : Object.create(DictionaryApi.prototype);

      DictionaryApi.call(
        self,
        function(search) {
          return {
            url: 'https://glosbe.com/gapi/translate?from=' + from + '&dest=' + to + '&format=json&tm=true&phrase=' +
              encodeURIComponent(search)
          };
        },
        function(data, cb) {
          if (data.result !== 'ok') return cb(new Error(data));
          var results = {
            main: {
              word: data.phrase,
              senses: data.tuc && data.tuc.filter(function(content) { return !!content.phrase; })
                .map(function(content) { return { definition: content.phrase.text }; })
            },
            meanings: data.tuc && data.tuc.filter(function(content) { return !!content.meanings })
              .map(function(content) { return content.meanings.map(function(meaning) { return meaning.text; }); }),
            examples: data.examples && data.examples
              .map(function(example) { return { first: example.first, second: example.second } })
          };
          return cb(null, results);
        });
      return self;
    }

    GlosbeDictionaryApi.prototype = Object.create(DictionaryApi.prototype);
    GlosbeDictionaryApi.prototype.constructor = GlosbeDictionaryApi;


    function OxfordDictionaryApi() {
      var self = this instanceof OxfordDictionaryApi ? this : Object.create(DictionaryApi.prototype);

      DictionaryApi.call(
        self,
        function(search) {
          return {
            url: 'https://od-api.oxforddictionaries.com:443/api/v1/entries/en/' + encodeURIComponent(search),
            headers: {
              "Accept": "application/json",
              "app_id": "e62f34a6",
              "app_key": "f1b0d4570a07f403b943a936e23261cb"
            }
          };
        },
        function(data, cb) {
          var result = data.results[0];
          if (!result) return cb(null, {});

          var results = {
            main: result.lexicalEntries && result.lexicalEntries.map(function(lexicalEntry) {
              return {
                word: lexicalEntry.text,
                lexicalCategory: lexicalEntry.lexicalCategory,
                lexicalSubcategory: lexicalEntry.grammaticalFeatures && lexicalEntry.grammaticalFeatures.text,
                pronunciations: lexicalEntry.pronunciations && lexicalEntry.pronunciations.map(function(pron) {
                  return {
                    notation: pron.phoneticNotation,
                    spelling: pron.phoneticSpelling,
                    audio: [
                      {
                        language: 'British English',
                        url: pron.audioFile
                      }
                    ]
                  };
                }),
                senses: lexicalEntry.entries[0] && lexicalEntry.entries[0].senses && lexicalEntry.entries[0].senses
                  .map(function(sense) {
                    return {
                      definition: sense.definitions[0],
                      examples: sense.examples && sense.examples.map(function(example) { return example.text; }),
                      subsenses: sense.subsenses && sense.subsenses.map(function(subsense) {
                        return {
                          definition: subsense.definitions[0],
                          examples: subsense.examples && subsense.examples
                            .map(function(example) { return example.text; })
                        };
                      })
                    };
                  })
              };
            })
          };
          return cb(null, results);
        });
      return self;
    }

    OxfordDictionaryApi.prototype = Object.create(DictionaryApi.prototype);
    OxfordDictionaryApi.prototype.constructor = OxfordDictionaryApi;


    function OwlBotDictionaryApi() {
      var self = this instanceof DictionaryApi ? this : Object.create(DictionaryApi.prototype);

      DictionaryApi.call(
        self,
        function(search) {
          return {
            url: 'https://owlbot.info/api/v1/dictionary/' + encodeURIComponent(search) + '?format=json'
          };
        },
        function(data, cb) {
          var results = {
            main: data.map(function(d) {
              return {
                lexicalCategory: d.type,
                senses: [
                  {
                    definition: d.defenition,
                    example: [d.example]
                  }
                ]
              };
            })
          };
          return cb(null, results);
        });

      return self;
    }

    OwlBotDictionaryApi.prototype = Object.create(DictionaryApi.prototype);
    OwlBotDictionaryApi.prototype.constructor = OwlBotDictionaryApi;

    var longmanContemporaryApi = new PearsonDictionaryApi('ldoce5');
    var longmanActiveStudyApi = new PearsonDictionaryApi('lasde');
    var longmanWordwiseApi = new PearsonDictionaryApi('wordwise');
    var longmanAdvancedAmerican = new PearsonDictionaryApi('laad3');
    var glosbeViEn = new GlosbeDictionaryApi('vie', 'eng');
    var glosbeEnVi = new GlosbeDictionaryApi('eng', 'vie');
    var oxfordApi = new OxfordDictionaryApi();
    var owlBotApi = new OwlBotDictionaryApi();


    return {
      'Longman Dictionary of Contemporary English (5th edition)': longmanContemporaryApi,
      'Longman Active Study Dictionary': longmanActiveStudyApi,
      'Longman Wordwise Dictionary': longmanWordwiseApi,
      'Longman Advanced American Dictionary': longmanAdvancedAmerican,
      'Glosbe English-Vietnamese': glosbeEnVi,
      'Glosbe Vietnamese-English': glosbeViEn,
      'Oxford Dictionaries': oxfordApi,
      'OwlBot Dictionary': owlBotApi
    };
  };
})(typeof exports === "undefined" ? (this['dictionaryApis'] = {}) : exports);