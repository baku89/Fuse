//--------------------------------------------------
// utils

var scroll = window.requestAnimationFrame ||
             window.webkitRequestAnimationFrame ||
             window.mozRequestAnimationFrame ||
             window.msRequestAnimationFrame ||
             window.oRequestAnimationFrame ||
             // IE Fallback, you can even fallback to onscroll
             function(callback){ window.setTimeout(callback, 1000/60) };

(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
})(window,document,'script','//www.google-analytics.com/analytics.js','ga');

ga('create', 'UA-57785251-1', 'auto');
ga('send', 'pageview');
  
//--------------------------------------------------
// constants

var	CELL_WIDTH = $.browser.mobile ? 2 : 4;

var BRUSH_DATA = {
	Ersr: { index: 0, size: $.browser.mobile ? 5.0 : 5.0 },
	Wall: { index: 1, size: $.browser.mobile ? 3.0 : 3.0 },
	Fuse: { index: 2, size: $.browser.mobile ? 3.0 : 1.5 },
	Bomb: { index: 3, size: $.browser.mobile ? 3.0 : 1.5 },
	Fire: { index: 4, size: $.browser.mobile ? 2.0 : 1.5 }
}

var MOBILE_WIDTH = 960;

var SHARE_SIZE_LONG = 240;
var SHARE_SIZE_SHORT = 160;

var shareSize = {};

var OPACITY_SHARE = {
	on: 0.3,
	off: 0.96
}

var URL = 'http://s.baku89.com/fuse/';


//--------------------------------------------------
// variables

var cntMouse = new THREE.Vector2();

// threejs
var ca;

var renderer;
var mainCanvas;
var shader;



var loadedPage = 0;

// cursor
var caPrevMouse = new THREE.Vector2();
var isMouseDown = false;
var currentBrush;

// rect
var resolution = new THREE.Vector2();
var shareRect = new THREE.Vector4();


// background buffer canvas
var buffCanvas = document.createElement('canvas');

// jQuery
var $body,
	$canvas,
	$galleryList;

//--------------------------------------------------
// on ready

(function($){

	var self = this;


	$(function() {
		self.setup();
	});

	// --------------------------------------------------
	// ! window event

	this.initStats = function() {

		stats = new Stats();
		stats.domElement.style.position = 'absolute';
		stats.domElement.style.top = 0;
		stats.domElement.style.left = 0;
		document.body.appendChild(stats.domElement);
	}

	this.setup = function() {

		console.log('setup');

		/* ========== init jQ ========== */

		$body  		  = $('body');
		$canvas       = $('#canvas');
		$tools        = $('.tools__btn');
		$gallery 	  = $('.layer--gallery');
		$galleryList  = $('.layer--gallery__list');


		// check support

		if ( !( Detector.canvas && Detector.webgl ) ) {

			$body.attr('data-status', 'unsupported');
			return;
		}


		// event

		$(window).on({
			'resize': self.onResize,
			'keyup':  self.onKeyUp,
			'popstate': self.onPopState,
			'orientationchange': self.onOrientationChange
		}).trigger('orientationchange');

		$canvas.on({
			'mousemove': self.onMouseMove,
			'mousedown': self.onMouseDown,
			'mouseup':  self.onMouseUp,
			'touchmove': self.onTouchMove,
			'touchstart': self.onTouchStart,
			'touchend': self.onTouchEnd
		});

		$tools.on( 'click', self.changeTool );

		$('.menu__btn').on('click', self.toggleMenu );
		$('.menu__clear').on('click', self.clearCanvas );
		$('.menu__share').on('click', self.showShare);
		$('.menu__gallery').on('click', self.showGallery);
		$('.menu__help').on('click', self.showHelp);

		$('.layer:not(.layer--share)').on('click', self.closeLayer );
		$('.layer--share').on('click', self.closeShare );
		$('.layer--share *, .layer--help a').on('click', self.preventClosingLayer );
		$('.alert--complete__tweet').on('click', self.tweet );

		$gallery.on( 'scroll', self.onScrollGallery );
		$(document).on('click', '.layer--gallery__list li', self.loadMap );



		/* ========== init CA System ========== */

		currentBrush = 'Fuse';

		// get current parameters
		resolution.set(Math.ceil( $canvas.width() / CELL_WIDTH ),
			           Math.ceil( $canvas.height() / CELL_WIDTH ));

		var x = Math.floor(( resolution.x - shareSize.width ) / 2),
			y = Math.floor(( resolution.y - shareSize.height ) / 2);
		shareRect.set(x, y, x + shareSize.width, y + shareSize.height);

		// init scene, renderer, camera
		renderer = new THREE.WebGLRenderer({
			canvas: $canvas[0],
			antialias: false,
			alpha: true
		});
		renderer.setSize( $canvas.width(), $canvas.height() );

		shader = new THREE.ShaderMaterial({
			vertexShader: $('#vs__passthru').html(),
			fragmentShader: $('#fs__coloring').html(),
			uniforms: {
				buffer:         { type: 't', value: null },

				resolution: 	{ type:'v2', value: resolution },
				shareRect:   	{ type:'v4', value: shareRect },

				cntMouse: 		{ type:'v2', value: new THREE.Vector2() },
				brushType: 		{ type: 'i', value: BRUSH_DATA[currentBrush].index },
				brushSize: 		{ type: 'f', value: BRUSH_DATA[currentBrush].size },

				colorBlnk:      { type: 'c', value: new THREE.Color( 0x474d52 ) },
			    colorWallBg:	{ type: 'c', value: new THREE.Color( 0x272e38 ) },
			    colorWallLn:	{ type: 'c', value: new THREE.Color( 0x323942 ) },
			    colorFuse:	    { type: 'c', value: new THREE.Color( 0xd5d7bf ) },
			    colorBomb:	    { type: 'c', value: new THREE.Color( 0xdad95c ) },
			    colorFireFr:	{ type: 'c', value: new THREE.Color( 0xee9121 ) },
			    colorFireBk:	{ type: 'c', value: new THREE.Color( 0xf52661 ) },
			    opacityShare:   { type: 'f', value: OPACITY_SHARE.off }
			}
		});
		mainCanvas = new ShaderCanvas(renderer, shader, true);

		// init ca
		ca = new CellularAutomaton(renderer, {
			fragmentShader: $('#fs__automaton').html(),
			resolution: resolution,
			uniforms: {
				resolution: { type: 'v2', value: resolution },
				prevMouse:  { type: 'v2', value: new THREE.Vector2() },
				cntMouse:   { type: 'v2', value: new THREE.Vector2() },
				isMouseDown:{ type:  'i', value: 0 },
				brushSize:  { type:  'f', value: BRUSH_DATA[currentBrush].size },
				brushType:  { type:  'i', value: BRUSH_DATA[currentBrush].index },
				isPause: 	{ type:  'i', value: 0 }
			}
		});


		/* ========== Setup InitMap ========== */

		if ( (id = $body.data('id')) && (map = $body.data('map')) ) {

			self.loadMap( id, map );
		
		}

		/* ========== Start ========== */

		createjs.Ticker.setFPS(50);
		createjs.Ticker.addEventListener('tick', self.draw);
	}

	// --------------------------------------------------
	// ! window event

	this.isPortrait = function() {
		return (typeof window.orientation !== 'undefined') && Math.abs(window.orientation) != 90;
	}

	this.onResize = function() {

		window.resizeEvent;
		clearTimeout( window.resizeEvent );

		window.resizeEvent = setTimeout( self.updateResolution, 250 );
	},

	this.onOrientationChange = function() {

		if ( self.isPortrait() ) {

			// portrait
			shareSize.width = SHARE_SIZE_SHORT;
			shareSize.height = SHARE_SIZE_LONG;

		} else {

			// landscape
			shareSize.width = SHARE_SIZE_LONG;
			shareSize.height = SHARE_SIZE_SHORT;
		}

	}

	// --------------------------------------------------
	// ! layer

	this.toggleMenu = function() {

		var flag = $body.attr('data-status') === 'draw';

		$body.attr( 'data-status', flag ? 'menu' : 'draw' );
		self.togglePause( flag, true );
	}

	this.togglePause = function(flag, disableMessage) {

		flag = (typeof flag === 'boolean') ? flag : !ca.uniforms.isPause.value;

		ca.uniforms.isPause.value = flag;

		if ( flag ) {
			isMouseDown = false;
		}

		if ( !disableMessage ) {
			$('.layer--pause').toggleClass('is-visible', flag);
			$body.attr('data-status', (flag ? 'layer' : 'draw') );
		}
	}

	this.showHelp = function() {

		$body.attr('data-status', 'layer');
		self.togglePause( true, true );

		$('.layer--help').addClass('is-visible');
	}

	this.closeLayer = function() {

		$body.attr('data-status', 'draw');

		$('.layer').removeClass('is-visible');

		self.togglePause( false );
	}

	this.preventClosingLayer = function( e ) {

		if ( !$(this).hasClass('is-passthru') ) {
			e.stopPropagation();
		}
	}

	// --------------------------------------------------
	// ! share

	this.showShare = function() {

		$body.attr('data-status', 'layer');

		self.togglePause(true, true);

		$('.layer--share')
			.attr('status', 'loading')
			.addClass('is-visible');

		$('.share-frame--top').css('bottom', window.innerHeight - shareRect.y * CELL_WIDTH );
		$('.share-frame--right').css('left', shareRect.z * CELL_WIDTH);
		$('.share-frame--bottom').css('top', shareRect.w * CELL_WIDTH);
		$('.share-frame--left').css('right', window.innerWidth - shareRect.x * CELL_WIDTH );

		$('.alert--url__btn--gallery').on('click', function() {

			self.closeShare( self.showGallery );
		});

		$('.alert--url__btn--resume').on('click', self.closeShare );


		// get map pixel data
		var pixels = ca.readPixels( shareRect.x, shareRect.y,
			   		                shareSize.width, shareSize.height );
		if ( pixels === null ) {
			console.log('Error Occured');
			return;
		}

		// disable alpha, and check if canvas is not empty
		var isFilled = 0x0;
		for ( var i = 0, il = shareSize.width * shareSize.height; i < il; i++ ) {
			pixels[ i*4 + 3 ] = 255;

			isFilled |= pixels[ i*4 ] | pixels[ i*4 + 1 ] | pixels[ i*4 + 2 ];
		}

		if ( !isFilled ) {

			$('.alert--failed__content').html('Please draw something.');
			$('.layer--share').attr('status', 'failed');

			return;
		}


		var mapImage = self.convertArrayToBase64( shareSize.width, shareSize.height, pixels );

		// get thumb pixel data
		pixels = mainCanvas.readPixels( resolution.x, resolution.y,
									    shareRect.x, shareRect.y, shareSize.width, shareSize.height );

		if ( pixels === null ) {
			console.log('Error occured');
		}
		var thumbImage = self.convertArrayToBase64( shareSize.width, shareSize.height, pixels );

		var result;

		// post data
		$.ajax({
			type: 'POST',
			url: './api/post.php',
			data: {
				map: mapImage,
				thumb: thumbImage
			},
			success: function( data ) {

				console.log( data );

				var json;

				try {
					json = $.parseJSON( data );
				} catch ( e ) {}

				if ( !(typeof json !== 'undefined' && json.status == 'OK') ) {

					result = 'failed';
					return;
				}

				var url = URL + '?n=' + json.id;

				var params = {
					url: url,
					text: 'Fuse (No.' + json.id + ')'
				};

				var intent = 'https://twitter.com/intent/tweet?' + $.param( params );

				$('.alert--complete__url').val( url );
				$('.alert--complete__tweet').attr('href', intent );

				result = 'complete';

			},
			error: function( XMLHttpRequest, textStatus, errorThrown ) {

				result = 'failed';
			},
			complete: function() {

				if ( result == 'failed' ) {
					$('.alert--failed__content').html('Failed in sending data..');
				}

				setTimeout(function() {
					$('.layer--share').attr('status', result);
				}, 500);
			}
		});
	}

	this.closeShare = function( callback ) {

		$('.share-frame').attr('style', '');
		$('.layer--share').attr('status', '');

		setTimeout(function() {

			$body.attr('data-status', 'draw');
			self.togglePause( false );
			$('.layer--share').removeClass('is-visible');

			if ( typeof callback === 'function') callback();

		}, 500);
	}

	this.tweet = function() {

		var windowOptions = 'scrollbars=yes,resizable=yes,toolbar=no,location=yes',
			width = 550,
			height = 420,
			winHeight = screen.height,
			winWidth = screen.width;

		var left = Math.round((winWidth / 2) - (width / 2));
        var top = 0;

        var url = $(this).attr('href');

        if (winHeight > height) {
         	top = Math.round((winHeight / 2) - (height / 2));
        }

        window.open(url, 'intent', windowOptions + ',width=' + width +
                    ',height=' + height + ',left=' + left + ',top=' + top);


        return false;
    }

	// --------------------------------------------------
	// ! gallery

	var lockLoadingGallery = false;

	this.showGallery = function() {

		$body.attr('data-status', 'layer');
		self.togglePause(true, true);

		$gallery.addClass('is-visible');


		if ( loadedPage == 0 ) {

			self.loadGallery();
		}
	}

	this.loadGallery = function() {

		$gallery.attr('data-status', 'loading');
		lockLoadingGallery = true;

		$.getJSON( './api/get.php', { page: loadedPage }, appendPost );


		function appendPost( json ) {

			console.log( json );

			$gallery.attr('data-status', 'complete');

			if ( json.status === 'failed' ) {

				return;

			} else if ( json.status === 'empty' ) {

				$gallery.attr('data-status', 'nomore');
				$gallery.off('scroll');
			}

			var content = json.content;

			for ( var i = 0; i < content.length; i++ ) {

				$galleryList.append(
					'<li data-id="'+content[i].id+ '" data-map="./data/' +content[i].map+ '">' +
						'<img src="./data/' +content[i].thumb+ '">' +
					'</li>'
				);
			}

			lockLoadingGallery = false;
		}

		loadedPage += 1;
	}

	this.onScrollGallery = function( e ) {

		scroll( evaluteLoadingGallery );
	}

	this.evaluteLoadingGallery = function() {

		if ( !lockLoadingGallery && $gallery.scrollTop() + $gallery.innerHeight() >= $gallery[0].scrollHeight) {
            
			self.loadGallery();
        }
	}

	// --------------------------------------------------
	// ! control

	this.changeTool = function(kind) {

		if (typeof kind !== "string") {
			kind = $(this).data('kind');
		}

		currentBrush = kind;

		ca.uniforms.brushType.value = BRUSH_DATA[currentBrush].index;
		ca.uniforms.brushSize.value = BRUSH_DATA[currentBrush].size;

		$elm = $tools.filter('[data-kind=' +kind+ ']');

		$elm.addClass('is-active');
		$tools.not( $elm ).removeClass('is-active');
	}

	// update shareRect, etc..
	this.updateResolution = function() {

		console.log('updateResolution');

		if ( $body.data('status') === 'menu' && window.innerWidth > MOBILE_WIDTH ) {

			$body.attr('data-status', 'draw' );
		}

		resolution.set(Math.ceil( window.innerWidth / CELL_WIDTH ),
			           Math.ceil( window.innerHeight / CELL_WIDTH ));

		var x = Math.floor(( resolution.x - shareSize.width ) / 2),
			y = Math.floor(( resolution.y - shareSize.height ) / 2);
		shareRect.set(x, y, x + shareSize.width, y + shareSize.height);

		renderer.setSize( window.innerWidth, window.innerHeight );

		ca.setResolution( resolution );
	}

	this.clearCanvas = function() {

		$body.attr('data-status', 'draw');

		if ( $.browser.mobile ) {
			setTimeout(function() {
				location.href = '.';
			}, 300);
			return;
		}

		ca.clear();

		history.pushState({
			id: null,
			map: null
		}, null, '.' );

	}


	// --------------------------------------------------
	// ! map

	this.onPopState = function( e ) {

		if ( !event || !event.state ) {
			return;
		}

		console.log( e.originalEvent );

		if ( event.state.id ) {
			this.loadMap( event.state.id, event.state.map );
		} else {
			this.clearCanvas();
		}
	}

	this.loadMap = function ( id, url ) {

		$body.attr('data-status', 'loading');

		if ( id instanceof $.Event ) {

			id = $(this).data('id');
			url = $(this).data('map')
		}

		map = new Image();
		map.onload = onLoad;
		map.onerror = onError;
		map.src = url;


		function onLoad() {

			buffCanvas.width = resolution.x;
			buffCanvas.height = resolution.y;

			var ctx = buffCanvas.getContext('2d');

			if ( self.isPortrait() ) {

				ctx.translate( shareRect.x, shareRect.w );
				ctx.rotate( -Math.PI / 2 );
				ctx.drawImage( map, 0, 0 );

			} else {

				ctx.drawImage( map, shareRect.x, shareRect.y );
			}

			var texture = new THREE.Texture( buffCanvas );
			texture.needsUpdate = true;

			ca.resetByTexture( texture );

			self.togglePause( true );



			history.pushState({
				id: id,
				map: url
			}, null, '?n=' + id );
		}

		function onError() {

			console.log('loadMap(): an error occured');
			$body.attr('data-status', 'draw');
		}
	}

	// --------------------------------------------------
	// ! mouse & keyboard event

	this.onMouseMove = function( e ) {

		cntMouse.set( e.clientX, e.clientY );
	}

	this.onMouseDown = function() {

		isMouseDown = true;
	}

	this.onMouseUp = function() {

		isMouseDown = false;
	}

	this.onTouchMove = function( e ) {

		e.preventDefault();
		cntMouse.set( event.changedTouches[0].pageX, event.changedTouches[0].pageY );
	}

	this.onTouchStart = function( e ) {

		e.preventDefault();
		cntMouse.set( event.changedTouches[0].pageX, event.changedTouches[0].pageY );
		ca.uniforms.cntMouse.value.set( cntMouse.x / CELL_WIDTH, cntMouse.y / CELL_WIDTH );
		isMouseDown = true;

	}

	this.onTouchEnd = function ( e ) {

		e.preventDefault();
		cntMouse.set( event.changedTouches[0].pageX, event.changedTouches[0].pageY );
		isMouseDown = false;

	}

	this.onKeyUp = function( e ) {

		var key = String.fromCharCode( e.keyCode );

		switch( key ) {
			case ' ':
				if ( $body.data('status') === 'draw' ) self.togglePause();
				break;
			case 's':
			case 'S':
				self.showShare();
				break;
			case '1':
				self.changeTool('Fuse');
				break;
			case '2':
				self.changeTool('Bomb');
				break;
			case '3':
				self.changeTool('Fire');
				break;
			case '4':
				self.changeTool('Wall');
				break;
			case '5':
				self.changeTool('Ersr');
				break;
		}

		if ( e.keyCode == 38 ) {
			BRUSH_DATA[currentBrush].size += 2.0;
			this.changeTool(currentBrush);
		} else if ( e.keyCode == 40 ) {
			BRUSH_DATA[currentBrush].size = Math.max(1, BRUSH_DATA[currentBrush].size - 2.0);
			this.changeTool(currentBrush);
		}
	}

	// --------------------------------------------------
	// ! draw
	this.draw = function() {

		if ( createjs.Ticker.getPaused() ) {
			return;
		}

		ca.uniforms.isMouseDown.value = isMouseDown;
		ca.uniforms.prevMouse.value.copy( ca.uniforms.cntMouse.value );
		ca.uniforms.cntMouse.value.set( cntMouse.x / CELL_WIDTH,
										cntMouse.y / CELL_WIDTH );

		ca.update();

		shader.uniforms.buffer.value = ca.texture;

		mainCanvas.render();
	}

	// --------------------------------------------------
	// ! utils

	this.convertArrayToBase64 = function( width, height, pixels ) {

		buffCanvas.width = width;
	    buffCanvas.height = height;
	    var context = buffCanvas.getContext('2d');

	    // Copy the pixels to a 2D canvas
	    var imageData = context.createImageData(width, height);
	    imageData.data.set( pixels );
	    context.putImageData(imageData, 0, 0);

	    return buffCanvas.toDataURL();
	}

	this.convertImageToBase64 = function( img ) {

		buffCanvas.width = img.width;
		buffCanvas.height = img.height;
		var ctx = buffCanvas.getContext('2d');

		ctx.drawImage( img, 0, 0 );

		return buffCanvas.toDataURL();
	}


})( jQuery );

// --------------------------------------------------
// ! plugin