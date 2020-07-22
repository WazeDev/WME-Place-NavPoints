// ==UserScript==
// @name         WME Place NavPoints
// @namespace    WazeDev
// @version      2020.07.21.001
// @description  Add place entry point indicators to the map
// @author       MapOMatic
// @include      /^https:\/\/(www|beta)\.waze\.com\/(?!user\/)(.{2,6}\/)?editor.*$/
// @require      https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @grant        none
// ==/UserScript==

/* global W */
/* global OpenLayers */
/* global $ */
/* global WazeWrap */

const _settings = {
    visible: true,
    plaVisible: true
};

function drawLines() {
    const layer = W.map.venueLayer;
    layer.removeFeatures(layer.getFeaturesByAttribute('isNavLine', true));
    if (_settings.visible && W.map.getZoom() >= 6) {
        const features = [];
        const bounds = W.map.getExtent().scale(2.0);
        W.model.venues.getObjectArray()
            .filter(venue => (_settings.plaVisible || !venue.isParkingLot()) && bounds.intersectsBounds(venue.geometry.getBounds()))
            .forEach(venue => {
                const pts = [];
                pts.push(venue.geometry.getCentroid());
                if (venue.attributes.entryExitPoints.length) {
                    pts.push(venue.attributes.entryExitPoints[0].getPoint());
                }
                const s = findClosestSegment(pts[pts.length - 1], false, false, venue);
                if (s) {
                    pts.push(s.closestPoint);
                    const ls = new OpenLayers.Geometry.LineString(pts);
                    features.push(new OpenLayers.Feature.Vector(ls, { isNavLine: true }, { strokeColor: '#0FF', strokeWidth: 2, strokeDashstyle: '6 4' }));
                }
                features.push(
                    new OpenLayers.Feature.Vector(
                        pts[pts.length - 1],
                        { isNavLine: true },
                        {
                            pointRadius: 4,
                            strokeWidth: 2,
                            fillColor: '#A00',
                            strokeColor: '#0FF',
                            fillOpacity: 1
                        }
                    )
                );
            });
        layer.addFeatures(features);
    }
}

function findClosestSegment(mygeometry, ignorePLR, ignoreUnnamedPR, venue) {
    const segments = W.model.segments.getObjectArray();
    let minDistance = Infinity;
    let closestSegment;

    segments.forEach(segment => {
        const { roadType } = segment.attributes;
        let ignoreForRpp = false;
        const segmentStreetID = segment.attributes.primaryStreetID;

        if (venue.isResidential()) {
            const venueStreetID = venue.attributes.streetID;
            ignoreForRpp = !(segmentStreetID === venueStreetID
                || (WazeWrap.Model.getStreetName(venueStreetID) === WazeWrap.Model.getStreetName(segmentStreetID)
                    && WazeWrap.Model.getCityName(venueStreetID) === WazeWrap.Model.getStreetName(segmentStreetID)));
        }

        if (!ignoreForRpp
            && !segment.isDeleted()
            && ![10, 16, 18, 19].includes(roadType) // 10 ped boardwalk, 16 stairway, 18 railroad, 19 runway, 3 freeway
            && !(ignorePLR && roadType === 20) // PLR
            && !(ignoreUnnamedPR && roadType === 17 && WazeWrap.Model.getStreetName(segmentStreetID) === null)) { // PR
            const distanceToSegment = mygeometry.distanceTo(segment.geometry, { details: true });
            if (distanceToSegment.distance < minDistance) {
                minDistance = distanceToSegment.distance;
                closestSegment = segment;
                closestSegment.closestPoint = new OpenLayers.Geometry.Point(distanceToSegment.x1, distanceToSegment.y1);
            }
        }
    });
    return closestSegment;
}

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
    $('#layer-switcher-item_pla_navpoints').attr('disabled', checked ? null : true);
    saveSettings();
    drawLines();
}

function onPlaLayerCheckedChanged(checked) {
    _settings.plaVisible = checked;
    saveSettings();
    drawLines();
}

function init() {
    const loadedSettings = JSON.parse(localStorage.getItem('wme_place_navpoints'));
    $.extend(_settings, loadedSettings);
    const drawLinesFunc = () => errorHandler(drawLines);
    W.model.events.register('mergeend', null, drawLinesFunc);
    W.map.events.register('zoomend', null, drawLinesFunc);
    W.model.venues.on('objectschanged', drawLinesFunc);
    W.model.venues.on('objectsadded', drawLinesFunc);
    W.model.venues.on('objectsremoved', drawLinesFunc);
    W.model.segments.on('objectschanged', drawLinesFunc);
    W.model.segments.on('objectsadded', drawLinesFunc);
    W.model.segments.on('objectsremoved', drawLinesFunc);
    drawLines();
    WazeWrap.Interface.AddLayerCheckbox('Display', 'Place NavPoints', _settings.visible, onPlacesLayerCheckedChanged, null);
    WazeWrap.Interface.AddLayerCheckbox('Display', 'PLA NavPoints', _settings.visible, onPlaLayerCheckedChanged, null);
    $('#layer-switcher-item_pla_navpoints').attr('disabled', _settings.visible ? null : true).parent().css({ 'margin-left': '10px' });
}

function bootstrap() {
    if (W && W.map && WazeWrap.Ready) {
        init();
    } else {
        setTimeout(bootstrap, 200);
    }
}

bootstrap();
