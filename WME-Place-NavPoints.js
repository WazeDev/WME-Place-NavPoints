// ==UserScript==
// @name         WME Place NavPoints
// @namespace    WazeDev
// @version      2020.06.04.01
// @description  Add place entry point indicators to the map
// @author       MapOMatic
// @include      /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor.*$/
// @require      https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @grant        none
// ==/UserScript==

/* global W */
/* global OpenLayers */
/* global $ */

let _settings = {
    visible: true,
    plaVisible: true
};

function drawLines() {
    var layer = W.map.venueLayer;
    layer.removeFeatures(layer.getFeaturesByAttribute('isNavLine', true));
	if (_settings.visible && W.map.getZoom() >= 6) {
        var features = [];
		var bounds = W.map.getExtent().scale(2.0);
        W.model.venues.getObjectArray()
			.filter(v => (_settings.plaVisible || !v.isParkingLot()) && bounds.intersectsBounds(v.geometry.getBounds()))
			.forEach(v => {
            var pts = [];
            pts.push(v.geometry.getCentroid());
            if (v.attributes.entryExitPoints.length) {
                pts.push(v.attributes.entryExitPoints[0].getPoint());
            }
            var s = findClosestSegment(pts[pts.length-1], false, false);
            if (s) {
                pts.push(s.closestPoint);
                var ls = new OpenLayers.Geometry.LineString(pts);
                features.push(new OpenLayers.Feature.Vector(ls, {isNavLine: true }, {strokeColor: '#0FF', strokeWidth: 2, strokeDashstyle: '6 4'}));
            }
            features.push(new OpenLayers.Feature.Vector(pts[pts.length - 1], {isNavLine: true}, {pointRadius: 4, strokeWidth: 2, fillColor: '#A00', strokeColor: '#0FF', fillOpacity: 1}));
    	});
    	layer.addFeatures(features);
    }
}

function findClosestSegment(mygeometry, ignorePLR, ignoreUnnamedPR) {
    let segments = W.model.segments.getObjectArray();
    let minDistance = Infinity;
    let closestSegment;

    for (let idx = 0; idx < segments.length; idx++) {
        let s = segments[idx];

        let { roadType } = s.attributes;

        if (s.isDeleted()) {
            debugger;
            continue;
        }

        if ([10, 16, 18, 19].includes(roadType)) //10 ped boardwalk, 16 stairway, 18 railroad, 19 runway, 3 freeway
            continue;

        if (ignorePLR && roadType === 20) //PLR
            continue;

        if (ignoreUnnamedPR)
            if (roadType === 17 && WazeWrap.Model.getStreetName(s.attributes.primaryStreetID) === null) //PR
                continue;


        let distanceToSegment = mygeometry.distanceTo(s.geometry, { details: true });

        if (distanceToSegment.distance < minDistance) {
            minDistance = distanceToSegment.distance;
            closestSegment = s;
            closestSegment.closestPoint = new OpenLayers.Geometry.Point(distanceToSegment.x1, distanceToSegment.y1);
        }
    }
    return closestSegment;
};

function saveSettings() {
    localStorage.setItem('wme_place_navpoints', JSON.stringify(_settings));
}

function errorHandler(callback) {
    try {
        callback();
    } catch (ex) {
        console.error(ex);
    }
}

function onPlacesLayerCheckedChanged(checked) {
    _settings.visible = checked;
    $("#layer-switcher-item_pla_navpoints").attr('disabled', checked ? null : true);
    saveSettings();
    drawLines();
}

function onPlaLayerCheckedChanged(checked) {
    _settings.plaVisible = checked;
    saveSettings();
    drawLines();
}

function init() {
    var loadedSettings = JSON.parse(localStorage.getItem('wme_place_navpoints'));
    $.extend(_settings, loadedSettings);
    W.model.events.register('mergeend', null, () => errorHandler(drawLines));
    W.map.events.register('zoomend', null, () => errorHandler(drawLines));
    W.model.venues.on('objectschanged', () => errorHandler(drawLines));
    W.model.venues.on('objectsadded', () => errorHandler(drawLines));
    W.model.venues.on('objectsremoved', () => errorHandler(drawLines));
    W.model.segments.on('objectschanged', () => errorHandler(drawLines));
    W.model.segments.on('objectsadded', () => errorHandler(drawLines));
    W.model.segments.on('objectsremoved', () => errorHandler(drawLines));
    drawLines();
    WazeWrap.Interface.AddLayerCheckbox('Display', 'Place NavPoints', _settings.visible, onPlacesLayerCheckedChanged, null);
    WazeWrap.Interface.AddLayerCheckbox('Display', 'PLA NavPoints', _settings.visible, onPlaLayerCheckedChanged, null);
    $("#layer-switcher-item_pla_navpoints").attr('disabled', _settings.visible ? null : true).parent().css({'margin-left': '10px'});
}

function bootstrap() {
    if (W && W.map && WazeWrap.Ready) {
        init();
    } else {
        setTimeout(bootstrap, 200);
    }
}

bootstrap();
