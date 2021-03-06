// ==UserScript==
// @name         WME Place NavPoints
// @namespace    WazeDev
// @version      2020.09.11.001
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

let _layer;

// NOTE: There are occasions where the street is not loaded in the model yet, and
// the WazeWrap getStreetName function will throw an error.  This function will
// just return null instead.
// function getStreetName(primaryStreetID) {
//     const street = W.model.streets.getObjectById(primaryStreetID);
//     if (street) {
//         return street.name;
//     }
//     return null;
// }

function drawLines() {
    _layer.removeAllFeatures();
    if (!_settings.visible) return;

    const features = [];
    const bounds = W.map.getExtent().scale(2.0);
    const zoom = W.map.getZoom();
    W.model.venues.getObjectArray()
        .filter(venue => (
            _settings.plaVisible || !venue.isParkingLot())
            && bounds.intersectsBounds(venue.geometry.getBounds())
            && (zoom >= 6 || (venue.isResidential() && !venue.attributes.entryExitPoints.length)))
        .forEach(venue => {
            const pts = [];
            let mainColor = venue.isPoint() ? '#0FF' : '#0FF';
            let endPoint;

            // Get the places location.
            const placePoint = venue.geometry.getCentroid();
            pts.push(placePoint);

            // Get the main entry/exit point, if it exists.
            let entryExitPoint;
            if (venue.attributes.entryExitPoints.length) {
                entryExitPoint = venue.attributes.entryExitPoints[0].getPoint();
                endPoint = entryExitPoint;
                pts.push(entryExitPoint);
            } else {
                endPoint = placePoint;
            }

            // If RPP and no entry/exit point, draw a circle around it.
            if (venue.isResidential() && endPoint === placePoint) {
                features.push(new OpenLayers.Feature.Vector(
                    placePoint,
                    { isNavLine: true },
                    {
                        pointRadius: 15,
                        strokeWidth: 2,
                        strokeColor: mainColor,
                        strokeDashstyle: '6 4',
                        fillOpacity: 0
                    }
                ));
            } else {
                // Find the closest segment.
                const closestSegment = findClosestSegment(endPoint, false, false, venue);
                if (closestSegment) {
                    // Find the closest point on the closest segment (the stop point).
                    const stopPoint = closestSegment.closestPoint;
                    pts.push(stopPoint);

                    const placeStreetID = venue.attributes.streetID;
                    if (placeStreetID) {
                        // The intent here was to highlight places that route to a street with a name
                        // other than the place's street name, but I believe that is too common
                        // of a scenario and distracting.  Leaving this code here in case we
                        // can tweak it to be more useful somehow.

                        // const segmentStreetID = closestSegment.attributes.primaryStreetID;
                        // const segmentStreetName = getStreetName(segmentStreetID);
                        // const placeStreetName = getStreetName(placeStreetID);
                        // if (segmentStreetName !== placeStreetName) {
                        //     mainColor = '#FFA500';
                        // }
                    } else {
                        // If the place has no street listed, make the lines red.
                        mainColor = '#F00';
                    }

                    // Draw the lines.
                    features.push(new OpenLayers.Feature.Vector(
                        new OpenLayers.Geometry.LineString(pts),
                        { isNavLine: true },
                        {
                            strokeColor: mainColor,
                            strokeWidth: 2,
                            strokeDashstyle: '6 4'
                        }
                    ));

                    // Draw the stop point.
                    features.push(
                        new OpenLayers.Feature.Vector(
                            pts[pts.length - 1],
                            { isNavLine: true },
                            {
                                pointRadius: 4,
                                strokeWidth: 2,
                                fillColor: '#A00',
                                strokeColor: mainColor,
                                fillOpacity: 1
                            }
                        )
                    );

                    // Draw the entry/exit point, if it exists.
                    if (entryExitPoint) {
                        features.push(
                            new OpenLayers.Feature.Vector(
                                entryExitPoint,
                                { isNavLine: true },
                                {
                                    pointRadius: 4,
                                    strokeWidth: 2,
                                    strokeColor: mainColor,
                                    fillColor: '#FFF',
                                    fillOpacity: 1
                                }
                            )
                        );
                    }
                }
            }
        });

    _layer.addFeatures(features);
}

function findClosestSegment(mygeometry, ignorePLR, ignoreUnnamedPR, venue) {
    const segments = W.model.segments.getObjectArray();
    let minDistance = Infinity;
    let closestSegment;

    if (venue.isResidential() && !venue.attributes.entryExitPoints.length) {
        closestSegment = null;
    } else {
        segments.forEach(segment => {
            const { roadType } = segment.attributes;
            const segmentStreetID = segment.attributes.primaryStreetID;

            const ignoreForRpp = false;

            // if (venue.isResidential() && !venue.attributes.entryExitPoints.length) {
            //     const venueStreetID = venue.attributes.streetID;
            //     ignoreForRpp = !(segmentStreetID === venueStreetID
            //         || (WazeWrap.Model.getStreetName(venueStreetID) === WazeWrap.Model.getStreetName(segmentStreetID)
            //         && WazeWrap.Model.getCityName(venueStreetID) === WazeWrap.Model.getStreetName(segmentStreetID)));
            // }

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
    }
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
    const drawLinesFunc = drawLines; //() => errorHandler(drawLines);
    W.model.events.register('mergeend', null, drawLinesFunc);
    W.map.events.register('zoomend', null, drawLinesFunc);
    W.model.venues.on('objectschanged', drawLinesFunc);
    W.model.venues.on('objectsadded', drawLinesFunc);
    W.model.venues.on('objectsremoved', drawLinesFunc);
    W.model.segments.on('objectschanged', drawLinesFunc);
    W.model.segments.on('objectsadded', drawLinesFunc);
    W.model.segments.on('objectsremoved', drawLinesFunc);
    _layer = new OpenLayers.Layer.Vector('Place NavPoints Layer', {
        uniqueName: '__PlaceNavPointsLayer',
        displayInLayerSwitcher: false
    });
    W.map.addLayer(_layer);
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
