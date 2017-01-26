var path = require('path');
var express = require('express');
var request = require('request');
var cookieParser = require('cookie-parser');
require('dotenv').config();

// Spotify API keys
var client_id = process.env.CLIENT_ID;
var client_secret = process.env.CLIENT_SECRET;
var redirect_uri = process.env.REDIRECT_URI;

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

var stateKey = 'spotify_auth_state';

var app = express();
const PORT = 8888;

app.set('port', PORT);

app.use(express.static(path.join(__dirname + '/public')))
	.use(cookieParser());

app.get('/', function(req, res) {
//	res.sendFile(path.resolve('public/index.html'));
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

				var options = {
					url: 'https://api.spotify.com/v1/me',
					headers: {'Authorization': 'Bearer ' + access_token },
					json: true
				};

				// Use access token to access the Spotify Web API
				request.get(options, function(error, response, body) {
					console.log(body);
				});

				res.redirect('/#access_token=' + access_token +
					'&refresh_token=' + refresh_token);
			} else {
				res.redirect('/#error=invalid_token');
			}
		});
	}
});

app.get('/refresh_token', function(req, res) {

	// Request access token from refresh token
	var refresh_token = req.query.refresh_token
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