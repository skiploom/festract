var fs = require('fs');
var path = require('path');
var express = require('express');
var request = require('request');
var fileUpload = require('express-fileupload');
var cookieParser = require('cookie-parser');
var Tesseract = require('tesseract.js');
var Spotify = require('./spotify.js');
require('dotenv').config();

// Spotify API keys
var client_id = process.env.CLIENT_ID;
var client_secret = process.env.CLIENT_SECRET;
var redirect_uri = process.env.REDIRECT_URI;

var stateKey = 'spotify_auth_state';

// TODO: replace this global variable lol
var leggo;

var app = express();
const PORT = 8888;

app.set('port', PORT);

app.use(express.static(path.join(__dirname + '/public')))
	.use(cookieParser()).use(fileUpload());

app.get('/', function(req, res) {

});

app.post('/upload', function(req, res, next) {
	// Upload lineup image
	var lineup = req.files.uploaded;
	if (lineup.mimetype.substr(0,5) == 'image') {
		var ext = lineup.mimetype.substr(6);
		var lineupPath = path.join(__dirname + '/uploads/lineup.' + ext);
		lineup.mv(lineupPath, function(err) {
			if (err) {
				res.status(500).send(err);
			} else {
				runOCR(lineupPath);
			}
		});
	}

	res.redirect('/');
});

app.get('/create_playlist', function(req, res) {
	var state = generateRandomString(16);
	res.cookie(stateKey, state);

	// Request authorization
	var scope = 'playlist-read-private%20playlist-modify%20playlist-modify-private';
	res.redirect('https://accounts.spotify.com/authorize?client_id=' + client_id +
		'&response_type=code' +
		'&scope=' + scope +
		'&redirect_uri=' + encodeURIComponent(redirect_uri) +
		'&state=' + state);
});

app.get('/callback', function(req, res) {	
	// Check state parameter
	var code = req.query.code || null;
	var state = req.query.state || null;
	var storedState = req.cookies ? req.cookies[stateKey] : null;

	//var testArtists = ["beyonce", "radiohead", "oh wonder", "9sxL-"];
	var tracks = [];
	//var artists = testArtists;
	var artists = leggo.slice(0,100);

	var artistsToSearch = artists.length;
	var artistsSearched = 0;

	//var numTimesAddedTrack = 0; // Should be 1

	// Request refresh and access tokens
	if (state === null || state !== storedState) {
		res.redirect('/#&error=state_mismatch');
	} else {
		res.clearCookie(stateKey);
		var authOptions = {
			url: 'https://accounts.spotify.com/api/token',
			form: {
				code: code,
				redirect_uri: redirect_uri,
				grant_type: 'authorization_code'
			},
			headers: {
				'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
			},
			json: true
		};

		request.post(authOptions, function(error, response, body) {
			if (!error && response.statusCode === 200) {
				var access_token = body.access_token,
					refresh_token = body.refresh_token;

				// Generate playlist
				Spotify.getUsername(access_token, function(err, user) {
					if (err) return console.error(err);

					Spotify.createPlaylist(namePlaylist(), user, access_token, function(err, playlist) {
						if (err) return console.error(err);

						artists.forEach(function(artist) {
							Spotify.getTopTrack(artist, access_token, function(err, track) {
								var trackURI = new String(track);

								artistsSearched++;
								console.log('Processed ' + artistsSearched + ' of ' + artistsToSearch + ' artists.');

								if (err && artistsSearched != artistsToSearch) return console.error(err);

								else if (!err && artistsSearched != artistsToSearch) tracks.push(trackURI);

								if (artistsSearched == artistsToSearch) {

									if (!err) tracks.push(trackURI);							
									
									Spotify.addTracks(tracks, user, playlist, access_token, function(err, data) {
										//console.log('Attempting to add tracks: ' + tracks);
										/*
										numTimesAddedTrack++;
										console.log('addTracks calls = ' + numTimesAddedTrack);
										*/
										if (err) return console.error(err);
/*
										if (data.retryAfter > 0) {
											setTimeout(function(tracks, user, playlist, access_token) {
												Spotify.addTracks(tracks, user, playlist, access_token, function(err, data) {
													if (err) return console.error(err);
												})
											}, data.retryAfter * 1000 + 1000);
										}*/
									});
								}
							});
						});
					});
				});

				res.redirect('/?access_token=' + encodeURIComponent(access_token) +
					'&refresh_token=' + encodeURIComponent(refresh_token));
			} else {
				res.redirect('/#error=invalid_token');
			}
		});
	}
});

app.get('/refresh_token', function(req, res) {
	// Request access token from refresh token
	var refresh_token = req.query.refresh_token;
	var authOptions = {
		url: 'https://accounts.spotify.com/api/token',
		headers: {
			'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
		},
		form: {
			grant_type: 'refresh_token',
			refresh_token: refresh_token
		},
		json: true
	};

	request.post(authOptions, function(error, response, body) {
		if (!error && response.statusCode === 200) {
			var access_token = body.access_token;
			res.send({
				'access_token': access_token
			});
		}
	});
});

var server = app.listen(app.get('port'), function() {
	var port = server.address().port;
	console.log('Listening on port ' + port);

});

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
	var text = '';
	var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

	for (var i = 0; i < length; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
};

var runOCR = function(url) {
	console.log("Parsing text from image...");
    Tesseract.recognize(url)
    	.progress(function(progress) {
    		console.log(progress["status"] + " (" + (progress["progress"] * 100) + "%)");
    	}).then(function(result) {
            console.log(result.text);
            leggo = splitResults(spellCheck(result.text));
            console.log(leggo);
        }).catch(function(error) {
        	console.error(error);
        });
}

var splitResults = function(result) {
	// TODO: Add \n newline separator
	var separator = /\s\W\s|\s\d\s/;
	var artists = result.split(separator);

	//console.log("artist list: " + artists);
	return artists;
}

var spellCheck = function(text) {
	// Left parenthesis '(' to 'C'
	text = text.replace(/\(/g, "C");
	
	// Zero '0' to 'O'
	text = text.replace(/0/g, "O");

	// 'ihe' to 'the'
	text = text.replace(/ihe/gi, "the");

	// \n to ' - '
	text = text.replace(/\n/g, " - ");

	return text.toLowerCase();
}

var namePlaylist = function(name) {
	return (name ? name : "Festract - " + (new Date().toString()));
}