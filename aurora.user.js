// ==UserScript==
// @id             iitc-plugin-aurora
// @name           IITC plugin: Aurora Glyph Hack Challenge
// @category       Misc
// @version        0.1.0.20190820.185425
// @description    [2019-08-20-185425] Allow manual entry of portals glyphed during Aurora Glyph Hack Challenge. Use the 'highlighter-aurora' plugin to show the portals on the map, and 'sync' to share between multiple browsers or desktop/mobile.
// @updateURL      https://raw.githubusercontent.com/mrDinckleman/iitc-plugins/master/aurora.user.js
// @downloadURL    https://raw.githubusercontent.com/mrDinckleman/iitc-plugins/master/aurora.user.js
// @namespace      https://github.com/mrDinckleman/iitc-plugins
// @include        https://intel.ingress.com/*
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

/* globals $ */

function wrapper(plugin_info) {
  // Ensure plugin framework is there, even if iitc is not yet loaded
  if (typeof window.plugin !== 'function') window.plugin = function () {};

  // PLUGIN START //////////////////////////////////////////////////////////
  var glyph = {
    1: parseInt('00001', 2),
    2: parseInt('00010', 2),
    3: parseInt('00100', 2),
    4: parseInt('01000', 2),
    5: parseInt('10000', 2)
  };

  // Use own namespace for plugin
  window.plugin.aurora = function () {};

  // Delay in ms
  window.plugin.aurora.SYNC_DELAY = 5000;

  // Maps the JS property names to localStorage keys
  window.plugin.aurora.FIELDS = {
    'glyphed': 'plugin-aurora-data',
    'updateQueue': 'plugin-aurora-data-queue',
    'updatingQueue': 'plugin-aurora-data-updating-queue'
  };

  window.plugin.aurora.glyphed = {};
  window.plugin.aurora.updateQueue = {};
  window.plugin.aurora.updatingQueue = {};

  window.plugin.aurora.enableSync = false;

  window.plugin.aurora.disabledMessage = null;
  window.plugin.aurora.contentHTML = null;

  window.plugin.aurora.isHighlightActive = false;

  window.plugin.aurora.onPortalDetailsUpdated = function () {
    var $preview = $('#portaldetails > .imgpreview');

    if (typeof(Storage) === 'undefined') {
      $preview.after(window.plugin.aurora.disabledMessage);
      return;
    }

    var guid = window.selectedPortal;

    $preview.after(window.plugin.aurora.contentHTML);
    window.plugin.aurora.updateCheckedAndHighlight(guid);
  };

  window.plugin.aurora.updateCheckedAndHighlight = function (guid) {
    if (guid == window.selectedPortal) {
      var glyphInfo = window.plugin.aurora.glyphed[guid];
      var glyphed = (glyphInfo && glyphInfo.glyphed) || 0;

      $('#glyph_1').prop('checked', glyphed & glyph[1]);
      $('#glyph_2').prop('checked', glyphed & glyph[2]);
      $('#glyph_3').prop('checked', glyphed & glyph[3]);
      $('#glyph_4').prop('checked', glyphed & glyph[4]);
      $('#glyph_5').prop('checked', glyphed & glyph[5]);
    }

    if (window.plugin.aurora.isHighlightActive) {
      if (window.portals[guid]) {
        window.setMarkerStyle(window.portals[guid], guid == window.selectedPortal);
      }
    }
  };

  window.plugin.aurora.updateGlyphed = function (visited, val, guid) {
    if (guid == undefined) guid = window.selectedPortal;

    var glyphInfo = window.plugin.aurora.glyphed[guid];

    if (!glyphInfo) {
      window.plugin.aurora.glyphed[guid] = glyphInfo = {
        glyphed: 0
      };
    }

    // Nothing changed
    if (visited == !!(glyphInfo.glyphed & glyph[val])) return;

    glyphInfo.glyphed = glyphInfo.glyphed + (visited ? 1 : -1) * glyph[val];

    window.plugin.aurora.updateCheckedAndHighlight(guid);
    window.plugin.aurora.sync(guid);
  };

  // Stores the given GUID for sync
  window.plugin.aurora.sync = function (guid) {
    window.plugin.aurora.updateQueue[guid] = true;
    window.plugin.aurora.storeLocal('glyphed');
    window.plugin.aurora.storeLocal('updateQueue');
    window.plugin.aurora.syncQueue();
  };

  // Sync the queue, but delay the actual sync to group a few updates in a single request
  window.plugin.aurora.syncQueue = function () {
    if (!window.plugin.aurora.enableSync) return;

    clearTimeout(window.plugin.aurora.syncTimer);

    window.plugin.aurora.syncTimer = setTimeout(function () {
      window.plugin.aurora.syncTimer = null;

      $.extend(window.plugin.aurora.updatingQueue, window.plugin.aurora.updateQueue);
      window.plugin.aurora.updateQueue = {};
      window.plugin.aurora.storeLocal('updatingQueue');
      window.plugin.aurora.storeLocal('updateQueue');

      window.plugin.sync.updateMap('aurora', 'glyphed', Object.keys(window.plugin.aurora.updatingQueue));
    }, window.plugin.aurora.SYNC_DELAY);
  };

  // Call after IITC and all plugin loaded
  window.plugin.aurora.registerFieldForSyncing = function () {
    if (!window.plugin.sync) return;

    window.plugin.sync.registerMapForSync(
      'aurora',
      'glyphed',
      window.plugin.aurora.syncCallback,
      window.plugin.aurora.syncInitialed
    );
  };

  // Call after local or remote change uploaded
  window.plugin.aurora.syncCallback = function (pluginName, fieldName, e, fullUpdated) {
    if (fieldName === 'glyphed') {
      window.plugin.aurora.storeLocal('glyphed');

      // All data is replaced if other client update the data during this client offline
      if (fullUpdated) {
        // A full update - update the selected portal sidebar
        if (window.selectedPortal) {
          window.plugin.aurora.updateCheckedAndHighlight(window.selectedPortal);
        }

        // And also update all highlights, if needed
        if (window.plugin.aurora.isHighlightActive) {
          window.resetHighlightedPortals();
        }

        return;
      }

      if (!e) return;

      if (e.isLocal) {
        // Update pushed successfully, remove it from updatingQueue
        delete window.plugin.aurora.updatingQueue[e.property];
      } else {
        // Remote update
        delete window.plugin.aurora.updateQueue[e.property];
        window.plugin.aurora.storeLocal('updateQueue');
        window.plugin.aurora.updateCheckedAndHighlight(e.property);
      }
    }
  };

  // Syncing of the field is initialed, upload all queued update
  window.plugin.aurora.syncInitialed = function (pluginName, fieldName) {
    if (fieldName === 'glyphed') {
      window.plugin.aurora.enableSync = true;

      if (Object.keys(window.plugin.aurora.updateQueue).length > 0) {
        window.plugin.aurora.syncQueue();
      }
    }
  };

  window.plugin.aurora.storeLocal = function (name) {
    var key = window.plugin.aurora.FIELDS[name];
    if (key === undefined) return;

    var value = window.plugin.aurora[name];

    if (typeof value !== 'undefined' && value !== null) {
      localStorage[key] = JSON.stringify(window.plugin.aurora[name]);
    } else {
      localStorage.removeItem(key);
    }
  };

  window.plugin.aurora.loadLocal = function (name) {
    var key = window.plugin.aurora.FIELDS[name];
    if (key === undefined) return;

    if (localStorage[key] !== undefined) {
      window.plugin.aurora[name] = JSON.parse(localStorage[key]);
    }
  };

  /**
   * HIGHLIGHTER
   */
  window.plugin.aurora.highlighter = {
    highlight: function (data) {
      var guid = data.portal.options.ent[0];
      var glyphInfo = window.plugin.aurora.glyphed[guid];

      var style = {};

      if (glyphInfo) {
        var total = 0;

        if (glyphInfo.glyphed & glyph[1]) total += 1;
        if (glyphInfo.glyphed & glyph[2]) total += 1;
        if (glyphInfo.glyphed & glyph[3]) total += 1;
        if (glyphInfo.glyphed & glyph[4]) total += 1;
        if (glyphInfo.glyphed & glyph[5]) total += 1;

        switch (total) {
          case 0:
            style.fillColor = 'red';
            style.fillOpacity = 0.7;
            break;
          case 1:
            style.fillColor = 'coral';
            style.fillOpacity = 0.7;
            break;
          case 2:
            style.fillColor = 'orange';
            style.fillOpacity = 0.7;
            break;
          case 3:
            style.fillColor = 'yellow';
            style.fillOpacity = 0.6;
            break;
          case 4:
            style.fillColor = 'chartreuse';
            style.fillOpacity = 0.6;
            break;
          case 5:
            // glyphed all - no highlights
            break;
        }
      } else {
        // no glyph data at all
        style.fillColor = 'red';
        style.fillOpacity = 0.7;
      }

      data.portal.setStyle(style);
    },

    setSelected: function (active) {
      window.plugin.aurora.isHighlightActive = active;
    }
  };

  window.plugin.aurora.setupCSS = function () {
    $('<style>')
      .prop('type', 'text/css')
      .html('#aurora-container {'
          + 'display: block;'
          + 'text-align: center;'
          + 'margin: 6px 3px 1px 3px;'
          + 'padding: 0 4px;}'
        + '#aurora-container label {'
          + 'margin: 0 0.5em;}'
        + '#aurora-container input {'
          + 'vertical-align: middle;}')
      .appendTo('head');
  };

  window.plugin.aurora.setupContent = function () {
    window.plugin.aurora.contentHTML = '<div id="aurora-container">Aurora '
      + '<label><input type="checkbox" id="glyph_1" onclick="window.plugin.aurora.updateGlyphed($(this).prop(\'checked\'), 1)"> 1</label>'
      + '<label><input type="checkbox" id="glyph_2" onclick="window.plugin.aurora.updateGlyphed($(this).prop(\'checked\'), 2)"> 2</label>'
      + '<label><input type="checkbox" id="glyph_3" onclick="window.plugin.aurora.updateGlyphed($(this).prop(\'checked\'), 3)"> 3</label>'
      + '<label><input type="checkbox" id="glyph_4" onclick="window.plugin.aurora.updateGlyphed($(this).prop(\'checked\'), 4)"> 4</label>'
      + '<label><input type="checkbox" id="glyph_5" onclick="window.plugin.aurora.updateGlyphed($(this).prop(\'checked\'), 5)"> 5</label>'
      + '</div>';

    window.plugin.aurora.disabledMessage = '<div id="aurora-container" class="help" title="Your browser does not support localStorage">Plugin Aurora disabled</div>';
  };

  var setup = function () {
    window.plugin.aurora.setupCSS();
    window.plugin.aurora.setupContent();
    window.plugin.aurora.loadLocal('glyphed');
    window.addPortalHighlighter('Aurora', window.plugin.aurora.highlighter);
    window.addHook('portalDetailsUpdated', window.plugin.aurora.onPortalDetailsUpdated);
    window.addHook('iitcLoaded', window.plugin.aurora.registerFieldForSyncing);
  };
  // PLUGIN END //////////////////////////////////////////////////////////

  // Add the script info data to the function as a property
  setup.info = plugin_info;
  if (!window.bootPlugins) window.bootPlugins = [];
  window.bootPlugins.push(setup);

  // If IITC has already booted, immediately run the 'setup' function
  if (window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end

// Inject code into site context
var script = document.createElement('script');
var info = {};

if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
  info.script = {
    version: GM_info.script.version,
    name: GM_info.script.name,
    description: GM_info.script.description
  };
}

script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
