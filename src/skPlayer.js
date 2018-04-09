//SKPlayer
console.log('%cSKPlayer 3.0.8', 'color:#D94240');

//require('./src/skPlayer.scss'); //changed to use ./src/skPlayer.css

const electron = require('electron');
const {ipcRenderer} = electron;
const {dialog} = electron.remote;
const fs = require('fs');
const jsmediatags = require("jsmediatags");
let socket_connected = false;
// let url = "http://localhost:8080";
let url;
let socket;
const ss = require('socket.io-stream');

const Util = {
    leftDistance: (el) => {
        let left = el.offsetLeft;
        let scrollLeft;
        while (el.offsetParent) {
            el = el.offsetParent;
            left += el.offsetLeft;
        }
        scrollLeft = document.body.scrollLeft + document.documentElement.scrollLeft;
        return left - scrollLeft;
    },
    timeFormat: (time) => {
        let tempMin = parseInt(time / 60);
        let tempSec = parseInt(time % 60);
        let curMin = tempMin < 10 ? ('0' + tempMin) : tempMin;
        let curSec = tempSec < 10 ? ('0' + tempSec) : tempSec;
        return curMin + ':' + curSec;
    },
    percentFormat: (percent) => {
        return (percent * 100).toFixed(2) + '%';
    },
    ajax: (option) => {
        option.beforeSend && option.beforeSend();
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = () => {
            if(xhr.readyState === 4){
                if(xhr.status >= 200 && xhr.status < 300){
                    option.success && option.success(xhr.responseText);
                }else{
                    option.fail && option.fail(xhr.status);
                }
            }
        };
        xhr.open('GET',option.url);
        xhr.send(null);
    }
};

const readFile = (filePath, options) => {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, options, (err, buffer) => {
      if (err) {
        return reject(err);
      }
      return resolve(buffer);
    });
  });
};

const scrollYWithDistance = (element,scrollDistance,scrollDuration) => {
    // element.scrollTop += scrollDistance;

    let scrollTopTarget = element.scrollTop + scrollDistance;
    if(scrollTopTarget < 0) {
        scrollTopTarget = 0;
        scrollDistance = scrollTopTarget - element.scrollTop;
        if(scrollDistance == 0) return;
    }
    else if(scrollTopTarget+element.offsetHeight > element.scrollHeight){
        scrollTopTarget = element.scrollHeight-element.offsetHeight;
        scrollDistance = scrollTopTarget - element.scrollTop;
        if(scrollDistance == 0) return;
    }
    let scrollStep = scrollDistance / (scrollDuration * 200/3 );

    let scrollInterval = setInterval( () => {
            if ( (element.scrollTop < scrollTopTarget && scrollDistance > 0) || (element.scrollTop > scrollTopTarget && scrollDistance < 0) ) {
                element.scrollTop += scrollStep;
            }
            else{
                clearInterval(scrollInterval);
            }
        }, 15);
}

let instance = false;
const baseUrl = 'http://120.79.36.48/';//163
const default_cover_path = "./src/icon/default_cover.png";

class Music {

	constructor(option){
		this.type = null;
		this.path = null;
		this.name = null;
		this.author = null;
		this.cover = null;
        this.lyric = null;
		for(let property in this){
			if(typeof option[property] == typeof undefined || option[property] == null){
				console.log("Creation failed because of lacking "+property);
				return Object.create(null);
			}
			this[property] = option[property];
		}
        if(option.video)
            this.video = option.video;
	}
}

class skPlayer {

    constructor(option){
        if(instance){
            console.error('SKPlayer只能存在一个实例！');
            return Object.create(null);
        }else{
            instance = true;
        }

        const defaultOption = {
            element: document.getElementById('skPlayer'),
            autoplay: false,                             //true/false
            mode: 'listloop',                            //singleloop/listloop
            listshow: true                               //true/false
        };
        // this.option = Object.assign({},defaultOption,option);
        for(let defaultKey in defaultOption){
            if(!option.hasOwnProperty(defaultKey)){
                option[defaultKey] = defaultOption[defaultKey];
            }
        }
        this.option = option;

        if(!(this.option.musicList && this.option.musicList.listType && this.option.musicList.source)){
            console.error('请正确配置对象！');
            return Object.create(null);
        }
        this.root = this.option.element;
        this.listType = this.option.musicList.listType;
        this.isMobile = /mobile/i.test(window.navigator.userAgent);

        this.toggle = this.toggle.bind(this);
        this.toggleList = this.toggleList.bind(this);
        this.toggleLyric = this.toggleLyric.bind(this);
        this.toggleMute = this.toggleMute.bind(this);
        this.switchMode = this.switchMode.bind(this);
        this.toggleSearchBox = this.toggleSearchBox.bind(this);
        this.searchList = this.searchList.bind(this);
		this.browseMusicFile = this.browseMusicFile.bind(this);
        this.clearList = this.clearList.bind(this);
		this.musicsChosenCallback = this.musicsChosenCallback.bind(this);
        this.browseLyricFile = this.browseLyricFile.bind(this);
        this.displayLyricFromFile = this.displayLyricFromFile.bind(this);
        this.updateLyricPosition = this.updateLyricPosition.bind(this);
        this.saveMusicListToJSON = this.saveMusicListToJSON.bind(this);
        this.togglePlaybackRateBar = this.togglePlaybackRateBar.bind(this);
        this.changePlaybackRate = this.changePlaybackRate.bind(this);
        this.toggleVideoDisplay = this.toggleVideoDisplay.bind(this);
        this.browseVideoFile = this.browseVideoFile.bind(this);
        this.displayVideoFromFile = this.displayVideoFromFile.bind(this);

		this.root.innerHTML = this.template();
        if(this.listType === 'normal'){
			this.musicList = [];
			for(let i in this.option.musicList.source){
				this.musicList.push(new Music(this.option.musicList.source[i]));
			}
            this.init();
            this.bind();
        }else if(this.listType === 'cloud'){

            Util.ajax({
                url: baseUrl + 'playlist/detail?id=' + this.option.musicList.source,
                beforeSend: () => {
                    console.log('SKPlayer正在努力的拉取歌单 ...');
                },
                success: (data) => {
                    console.log('歌单拉取成功！');
                    this.option.musicList.source = JSON.parse(data);
					this.musicList = [];
					for(let i in this.option.musicList.source){
						this.option.musicList.source[i].type = 'cloud';
						this.option.musicList.source[i].path = baseUrl + 'music/url?id=' + this.option.musicList.source[i].song_id;
                        this.option.musicList.source[i].lyric = "none";
						this.musicList.push(new Music(this.option.musicList.source[i]));
					}
					console.log(this.musicList);
                    this.init();
                    this.bind();
                },
                fail: (status) => {
                    console.error('歌单拉取失败！ 错误码：' + status);
                }
            });
        }
    }

	getLiHTML(index){
		return `
                <li>
                    <i class="skPlayer-list-sign"></i>
                    <span class="skPlayer-list-index">${parseInt(index) + 1}</span>
                    <span class="skPlayer-list-name" title="${this.musicList[index].name}">${this.musicList[index].name}</span>
                    <span class="skPlayer-list-author" title="${this.musicList[index].author}">${this.musicList[index].author}</span>
                    <i class="skPlayer-single-remove"></i>
                </li>
            `
	}

	//render HTML
    template(){
        let html = `
            <div class="skPlayer-video-box">
                <div class="skPlayer-add-video-button"></div>
                <video class="skPlayer-video-player" controls>
                    <source src="" type="video/mp4">
                </video>
            </div>
            <audio class="skPlayer-source" src="" preload="auto"></audio>
            <div class="skPlayer-main">
                <div class="skPlayer-picture">
                    <img class="skPlayer-cover" src="${default_cover_path}" alt="">
                    <a href="javascript:;" class="skPlayer-play-btn">
                        <span class="skPlayer-left"></span>
                        <span class="skPlayer-right"></span>
                    </a>
                </div>
                <div class="skPlayer-control">
                    <p class="skPlayer-name"></p>
                    <p class="skPlayer-author"></p>
                    <div class="skPlayer-percent">
                        <div class="skPlayer-line-loading"></div>
                        <div class="skPlayer-line"></div>
                    </div>
                    <p class="skPlayer-time">
                        <span class="skPlayer-cur">00:00</span>/<span class="skPlayer-total">00:00</span>
                    </p>
                    <div class="skPlayer-button skPlayer-volume" style="${this.isMobile ? 'display:none;' : ''}">
                        <i class="skPlayer-icon"></i>
                        <div class="skPlayer-percent">
                            <div class="skPlayer-line"></div>
                        </div>
                    </div>
    				<i class="skPlayer-button ${this.option.mode === 'singleloop' ? 'skPlayer-mode skPlayer-mode-loop' : 'skPlayer-mode'}"></i>
                    <i class="skPlayer-button skPlayer-lyric-switch"></i>
                    <div class="skPlayer-button skPlayer-list-switch">
                        <i class="skPlayer-list-icon"></i>
                    </div>
                    <i class="skPlayer-button skPlayer-rate-button"></i>
                    <div class="skPlayer-rate-div">
                        <input type="range" class="skPlayer-rate-bar" orient="vertical">
                        <p class="skPlayer-rate-display">X<br />1</p>
                    </div>
                    <i class="skPlayer-button skPlayer-video-switch"></i>
                </div>
            </div>
			<div class="skPlayer-list-outter">
                <ul class="skPlayer-list">
        `;
        for(let index in this.musicList){
            html += this.getLiHTML(index);
        }
        html += `
                </ul>
    			<div class="skPlayer-list-banner">
                    <i class="skPlayer-button skPlayer-list-searchicon"></i>
                    <input type="text" placeholder="Search.." class="skPlayer-list-searchbox"></i>
    				<i class="skPlayer-button skPlayer-list-clear"></i>
    				<i class="skPlayer-button skPlayer-list-add"></i>
    			</div>
			</div>
            <div class="skPlayer-lyric-block">
                <div class="skPlayer-add-lyric-button"></div>
                <ul class="skPlayer-lyric-ul"></ul>
            </div>
        `;
        return html;
    }

    init(){
        this.dom = {
            cover: this.root.querySelector('.skPlayer-cover'),
            playbutton: this.root.querySelector('.skPlayer-play-btn'),
            name: this.root.querySelector('.skPlayer-name'),
            author: this.root.querySelector('.skPlayer-author'),
            timeline_total: this.root.querySelector('.skPlayer-percent'),
            timeline_loaded: this.root.querySelector('.skPlayer-line-loading'),
            timeline_played: this.root.querySelector('.skPlayer-percent .skPlayer-line'),
            timetext_total: this.root.querySelector('.skPlayer-total'),
            timetext_played: this.root.querySelector('.skPlayer-cur'),
            volumebutton: this.root.querySelector('.skPlayer-icon'),
            volumeline_total: this.root.querySelector('.skPlayer-volume .skPlayer-percent'),
            volumeline_value: this.root.querySelector('.skPlayer-volume .skPlayer-line'),
            lyricbutton: this.root.querySelector('.skPlayer-lyric-switch'),
            addlyricbutton: this.root.querySelector('.skPlayer-add-lyric-button'),
            switchbutton: this.root.querySelector('.skPlayer-list-switch'),
            modebutton: this.root.querySelector('.skPlayer-mode'),
            listsearchiconbutton: this.root.querySelector('.skPlayer-list-searchicon'),
            listsearchbox: this.root.querySelector('.skPlayer-list-searchbox'),
			listclearbutton: this.root.querySelector('.skPlayer-list-clear'),
			listaddbutton: this.root.querySelector('.skPlayer-list-add'),
            musiclist: this.root.querySelector('.skPlayer-list'),
            lyricblock: this.root.querySelector('.skPlayer-lyric-block'),
            lyricul: this.root.querySelector('.skPlayer-lyric-ul'),
            playbackratebutton: this.root.querySelector('.skPlayer-rate-button'),
            playbackratediv: this.root.querySelector('.skPlayer-rate-div'),
            playbackratebar: this.root.querySelector('.skPlayer-rate-bar'),
            playbackratedisplay: this.root.querySelector('.skPlayer-rate-display'),
            videoswitch: this.root.querySelector('.skPlayer-video-switch'),
            videoplayer: this.root.querySelector('.skPlayer-video-player'),
            addvideobutton: this.root.querySelector('.skPlayer-add-video-button')
        };

        if(this.option.listshow){
            this.root.className = 'skPlayer-list-on';
        }

        this.dom.playbackratebar.max = 5;
        this.dom.playbackratebar.min = 1;
        this.dom.playbackratebar.step = 1;
        this.dom.playbackratebar.value = 3;

		let audioNode = this.root.querySelector('.skPlayer-source');
		this.audio = audioNode;

		if(this.musicList.length > 0){
			audioNode.setAttribute("src", this.musicList[0].path);
			if(this.option.mode === 'singleloop'){
				this.audio.loop = true;
			}
			for(let i in this.musicList){
				this.dom.musiclist.innerHTML += this.getLiHTML(i);
			}
			this.switchMusic(0);
		}
    }

    bind(){
        this.updateProgressBar = () => {
            let percent = this.audio.buffered.length ? (this.audio.buffered.end(this.audio.buffered.length - 1) / this.audio.duration) : 0;
            this.dom.timeline_loaded.style.width = Util.percentFormat(percent);
        };

        this.audio.addEventListener('durationchange', (e) => {
            this.dom.timetext_total.innerHTML = Util.timeFormat(this.audio.duration);
            this.updateProgressBar();
        });
        this.audio.addEventListener('progress', (e) => {
            this.updateProgressBar();
        });
        this.audio.addEventListener('canplay', (e) => {
            if(this.option.autoplay && !this.isMobile){
                this.play();
            }
        });
        this.audio.addEventListener('timeupdate', (e) => {
            let percent = this.audio.currentTime / this.audio.duration;
            this.dom.timeline_played.style.width = Util.percentFormat(percent);
            this.dom.timetext_played.innerHTML = Util.timeFormat(this.audio.currentTime);

            this.updateLyricPosition(this.audio.currentTime);
        });
        this.audio.addEventListener('seeked', (e) => {
            this.play();
        });
        this.audio.addEventListener('ended', (e) => {
            this.next();
        });

        this.dom.playbutton.addEventListener('click', this.toggle);
        this.dom.switchbutton.addEventListener('click', this.toggleList);
        this.dom.lyricbutton.addEventListener('click', this.toggleLyric);
        this.dom.addlyricbutton.addEventListener('click', this.browseLyricFile);
        this.dom.playbackratebutton.addEventListener('click', this.togglePlaybackRateBar);
        this.dom.videoswitch.addEventListener('click', this.toggleVideoDisplay);
        this.dom.addvideobutton.addEventListener('click', this.browseVideoFile);
        this.dom.playbackratebar.addEventListener('change', this.changePlaybackRate);
        document.addEventListener('click', (e)=>{
            if(e.target && e.target.classList.contains("skPlayer-single-remove")){
                this.removeFromList(e.target.parentNode);
            }
        });
        if(!this.isMobile){
            this.dom.volumebutton.addEventListener('click', this.toggleMute);
        }
        this.dom.listsearchiconbutton.addEventListener('click', this.toggleSearchBox);
        this.dom.listsearchbox.addEventListener('input', this.searchList);
		this.dom.listaddbutton.addEventListener('click', this.browseMusicFile);
		this.dom.listclearbutton.addEventListener('click', this.clearList);
        this.dom.modebutton.addEventListener('click', this.switchMode);
        this.dom.musiclist.addEventListener('click', (e) => {
            let target,index,curIndex;
            if(e.target.tagName.toUpperCase() === 'LI'){
                target = e.target;
            }else if(!e.target.classList.contains("skPlayer-single-remove") && e.target.parentElement.tagName.toUpperCase() === 'LI'){
                target = e.target.parentElement;
            }else{
                return;
            }
            index = this.getElementIndex(target);
            curIndex = this.getElementIndex(this.dom.musiclist.querySelector('.skPlayer-curMusic'));
            if(index === curIndex){
                this.play();
            }else{
                this.switchMusic(index);
            }
        });
        this.dom.timeline_total.addEventListener('click', (event) => {
			if(this.musicList.length == 0) return;
            let e = event || window.event;
            let percent = (e.clientX - Util.leftDistance(this.dom.timeline_total)) / this.dom.timeline_total.clientWidth;
            if(!isNaN(this.audio.duration)){
                this.dom.timeline_played.style.width = Util.percentFormat(percent);
                this.dom.timetext_played.innerHTML = Util.timeFormat(percent * this.audio.duration);
                this.audio.currentTime = percent * this.audio.duration;
            }
        });
        if(!this.isMobile){
            this.dom.volumeline_total.addEventListener('click', (event) => {
                let e = event || window.event;
                let percent = (e.clientX - Util.leftDistance(this.dom.volumeline_total)) / this.dom.volumeline_total.clientWidth;
                this.dom.volumeline_value.style.width = Util.percentFormat(percent);
                this.audio.volume = percent;
                if(this.audio.muted){
                    this.toggleMute();
                }
            });
        }
    }

    prev(){
        let index = this.getElementIndex(this.dom.musiclist.querySelector('.skPlayer-curMusic'));
        if(index === 0){
            if(this.musicList.length === 1){
                this.play();
            }else{
                this.switchMusic(this.musicList.length-1);
            }
        }else{
            this.switchMusic(index-1);
        }
    }

    next(){
        let index = this.getElementIndex(this.dom.musiclist.querySelector('.skPlayer-curMusic'));
        if(index === (this.musicList.length - 1)){
            if(this.musicList.length === 1){
                this.play();
            }else{
                this.switchMusic(0);
            }
        }else{
            this.switchMusic(index + 1);
        }
    }

    switchMusic(index){
        if(typeof index !== 'number'){
            console.error('请输入正确的歌曲序号！');
            console.error('testing1');
            return;
        }
        if(index < 0 || index >= this.musicList.length){
            console.error('请输入正确的歌曲序号！');
            return;
        }
		let currentPlayingMusicLi;
        if( (currentPlayingMusicLi = this.dom.musiclist.querySelector('.skPlayer-curMusic')) && index == this.getElementIndex(currentPlayingMusicLi)){
            this.play();
            return;
        }
		else if(currentPlayingMusicLi){
			this.dom.musiclist.querySelector('.skPlayer-curMusic').classList.remove('skPlayer-curMusic');
		}
		/*
        if(!this.isMobile){
           this.audio.pause();
           this.audio.currentTime = 0;
        }
		*/
        //switch to another music
        this.dom.lyricul.innerHTML = "";
        this.dom.lyricul.scrollTop = 0;
        this.dom.videoplayer.pause();
        this.dom.videoplayer.children[0].setAttribute("src","");
        this.dom.videoplayer.load();
        this.root.classList.remove("skPlayer-video-in");

		this.audio.currentTime = 0;
        this.dom.musiclist.children[index].classList.add('skPlayer-curMusic');
        this.dom.name.innerHTML = this.musicList[index].name;
        this.dom.author.innerHTML = this.musicList[index].author;
        this.dom.cover.src = this.musicList[index].cover;
        if(this.musicList[index].type === 'local'){
            this.audio.src = this.musicList[index].path;
            this.play();
        }else if(this.musicList[index].type === 'cloud'){
            this.playCloudMusic(index);
        }else{

            console.log('send request to server');
            socket.emit('requestMusic', {name: this.musicList[index].name, author: this.musicList[index].author});

        }

        console.log("check lyric");
        if(this.musicList[index].lyric == 'none'){
            if(this.dom.lyricblock.classList.contains('skPlayer-lyric-in'))
                this.dom.lyricblock.classList.remove('skPlayer-lyric-in')
        }
        else{
            if(!this.dom.lyricblock.classList.contains('skPlayer-lyric-in'))
                this.dom.lyricblock.classList.add('skPlayer-lyric-in')
            this.displayLyricFromFile(this.musicList[index].lyric,index);
        }

        console.log("check video");
        if(!this.musicList[index].video){
            if(this.dom.lyricblock.classList.contains('skPlayer-video-in'))
                this.root.classList.remove('skPlayer-video-in');
        }
        else{
            if(!this.dom.lyricblock.classList.contains('skPlayer-video-in')){
                this.root.classList.add('skPlayer-video-in');
            }
            this.displayVideoFromFile(this.musicList[index].video,index);
        }
        console.log("switch func finished");
    }

    play(){
        if(this.audio.paused && this.musicList.length){
            this.audio.play();
            this.dom.playbutton.classList.add('skPlayer-pause');
            this.dom.cover.classList.add('skPlayer-pause');
        }
    }

    pause(){
        if(!this.audio.paused){
            this.audio.pause();
            this.dom.playbutton.classList.remove('skPlayer-pause');
            this.dom.cover.classList.remove('skPlayer-pause');
        }

		if(this.musicList.length == 0){
			//reset the progress bar
			this.dom.timeline_loaded.style.width = 0;
			this.dom.timetext_total.innerHTML = '00:00';
			this.audio.currentTime = 0;
			this.dom.cover.setAttribute("src",default_cover_path);
			this.dom.name.innerHTML = '';
			this.dom.author.innerHTML = '';
		}
    }

    toggle(){
        this.audio.paused ? this.play() : this.pause();
    }

    toggleList(){
        this.root.classList.contains('skPlayer-list-on') ? this.root.classList.remove('skPlayer-list-on') : this.root.classList.add('skPlayer-list-on');
    }

    toggleLyric(){
        this.root.classList.contains('skPlayer-lyric-on') ? this.root.classList.remove('skPlayer-lyric-on') : this.root.classList.add('skPlayer-lyric-on');
    }

    toggleMute(){
        //暂存问题，移动端兼容性
        if(this.audio.muted){
            this.audio.muted = false;
            this.dom.volumebutton.classList.remove('skPlayer-quiet');
            this.dom.volumeline_value.style.width = Util.percentFormat(this.audio.volume);
        }else{
            this.audio.muted = true;
            this.dom.volumebutton.classList.add('skPlayer-quiet');
            this.dom.volumeline_value.style.width = '0%';
        }
    }

    switchMode(){
        if(this.audio.loop){
            this.audio.loop = false;
            this.dom.modebutton.classList.remove('skPlayer-mode-loop');
        }else{
            this.audio.loop = true;
            this.dom.modebutton.classList.add('skPlayer-mode-loop');
        }
    }

    destroy(){
        instance = false;
        this.audio.pause();
        this.root.innerHTML = '';
        for(let prop in this){
            delete this[prop];
        }
        console.log('该实例已销毁，可重新配置 ...');
    }

	playCloudMusic(index){
		Util.ajax({
			url: this.musicList[index].path,
			beforeSend: () => {
				console.log('SKPlayer正在努力的拉取歌曲 ...');
			},
			success: (data) => {
				let url = JSON.parse(data).url;
				if(url !== null){
					console.log('歌曲拉取成功！');
					this.audio.src = url;
					this.play();
					//暂存问题，移动端兼容性
				}else{
					console.log('歌曲拉取失败！ 资源无效！');
					if(this.musicList.length !== 1){
						this.next();
					}
				}
			},
			fail: (status) => {
				console.error('歌曲拉取失败！ 错误码：' + status);
			}
		});
	}

    //done
    toggleSearchBox(){
        this.dom.listsearchbox.classList.toggle('skPlayer-searchbox-show');
        this.dom.listsearchbox.value = '';
        this.dom.listsearchbox.focus();
        let count = this.dom.musiclist.children.length;
        for (let i = 0; i < count; i++) {
            this.dom.musiclist.children[i].classList.remove("skPlayer-hideCurMusic");
        }
    }

    //done
    searchList(e){
        let str = this.dom.listsearchbox.value;
        let count = this.dom.musiclist.children.length;
        let patt = new RegExp(str,"i");
        if(str.length > 0) {
            for (let i = 0; i < count; i++) {
                let li = this.dom.musiclist.children[i],
                    spanTitle = li.querySelector("span.skPlayer-list-name"),
                    spanArtist = li.querySelector("span.skPlayer-list-author");
                if (!patt.test(spanTitle.innerHTML) && !patt.test(spanArtist.innerHTML)) {
                    this.dom.musiclist.children[i].classList.add("skPlayer-hideCurMusic");
                } else {
                    this.dom.musiclist.children[i].classList.remove("skPlayer-hideCurMusic");
                }
            }
        } else {
            for (let i = 0; i < count; i++) {
                this.dom.musiclist.children[i].classList.remove("skPlayer-hideCurMusic");
            }
        }


    }

	//done
	clearList(){
		this.dom.musiclist.innerHTML = '';
        this.dom.lyricul.innerHTML = "";
        if(this.dom.lyricblock.classList.contains('skPlayer-lyric-in'))
            this.dom.lyricblock.classList.remove('skPlayer-lyric-in');
        if(this.root.classList.contains('skPlayer-video-in')){
            this.root.classList.remove('skPlayer-video-in');
            this.dom.videoplayer.children[0].setAttribute("src","");
            this.dom.videoplayer.load();
        }
		this.musicList = [];
        this.saveMusicListToJSON();
		this.pause();
        updateMusicList();
	}

	//done
	browseMusicFile(){
		console.log("browse music file");
		dialog.showOpenDialog({
			filters:[{name: 'Music', extensions: ['mp3','wav','wma','m4a']}],
			properties:['openFile','multiSelections']
			}, this.musicsChosenCallback);
	}

	//done
	musicsChosenCallback(filePaths){
		if(typeof filePaths == typeof undefined) return;
		for(let i in filePaths){
			this.addFileToList(filePaths[i]);
		}
	}

	//done
	addFileToList(filePath){
        jsmediatags.read(filePath,{
            onSuccess: (tags) => {
                console.log(tags);
                this.addMusicToList('local',filePath,tags.tags.title? tags.tags.title : 'unknown',tags.tags.artist? tags.tags.artist : 'unknown',default_cover_path);
            },
            onError: (error) => {
                console.log(error);
                //maybe try to check if the file is really a music file here

                //if it is, add to the list with all information unknown
                this.addMusicToList('local',filePath,'unknown','unknown',default_cover_path);
            }
        });
	}

    //done
    addMusicToList(type,path,title,artist,cover){
        let music = new Music({
            type: type,
            name: title,
            path: path,
            author: artist,
            cover: cover,
            lyric: 'none'
        });

        this.musicList.push(music);
        this.dom.musiclist.insertAdjacentHTML('beforeend', this.getLiHTML(this.musicList.length-1));

        if(this.musicList.length == 1){
            if(type != 'P2P')
                this.audio.setAttribute("src",path);
            this.switchMusic(0);
        }
        //should also update the music-list.json
        this.saveMusicListToJSON();
        updateMusicList();
    }

	//done
	removeFromList(node){
		let nodeCurr = node;
        console.log(nodeCurr);
        console.log(nodeCurr.nextElementSibling);
		let nodeAfter;
		while ((nodeAfter = nodeCurr.nextElementSibling)){
			let indexNode = nodeAfter.querySelector('.skPlayer-list-index');
			indexNode.innerHTML = parseInt(indexNode.innerHTML) - 1;
			nodeCurr = nodeAfter;
		}
        if(node.classList.contains("skPlayer-curMusic")){
            if(this.musicList.length == 0){
                this.rom.videoplayer.children[0].setAttribute("src","");
                this.rom.videoplayer.load();
                if(this.root.classList.contains('skPlayer-video-in')){
                    this.root.classList.remove('skPlayer-video-in');
                }
            }
            this.next();
        }
		this.musicList.splice(this.getElementIndex(node),1);
		this.dom.musiclist.removeChild(node);

		if(this.musicList.length == 0){
			this.pause();
		}

        this.saveMusicListToJSON();
        updateMusicList();
	}

	//done
	removeFromListByIndex(index){
		let node;
		if(node = this.musiclist.children[index])
			this.removeFromList(node);
	}

	//done
	getElementIndex(node){
		var nodes = Array.prototype.slice.call( node.parentElement.children );
		return nodes.indexOf( node );
	}

	//done
    browseLyricFile(){
        console.log("browse lyric file");
        let currentPlayingMusicLi;
        if( (currentPlayingMusicLi = this.dom.musiclist.querySelector('.skPlayer-curMusic')) ){
            let index = this.getElementIndex(currentPlayingMusicLi);
            console.log(index);
            dialog.showOpenDialog({
                filters:[{name: 'Lyric', extensions: ['lrc']}],
                properties:['openFile']
                }, (filePaths) => {
                    if(filePaths)
                        this.displayLyricFromFile(filePaths[0], index);
                });
        }
    }

    //done
    displayLyricFromFile(filePath, index){
        //console.log(filePath);
        if (!filePath) return;
        readFile(filePath, 'utf8').then((dataString) => {
            let lines = dataString.split("\n");
            if(lines.length == 0) return;
            this.dom.lyricblock.classList.add("skPlayer-lyric-in");
            let regex = new RegExp(/\[(\d\d)\:(\d\d\.\d\d)\](.+)/);
            for(let i in lines){
                let match, time;
                if(match = regex.exec(lines[i])){
                    time = parseInt(match[1])*60.0+parseFloat(match[2]);
                    //console.log(time + ' ' + match[3]);
                    let node = document.createElement("li");
                    node.innerHTML = match[3];
                    node.setAttribute("time", time);
                    this.dom.lyricul.appendChild(node);
                }
            }
            if(this.musicList[index].lyric != filePath){
                this.musicList[index].lyric = filePath;
                //update json file
                this.saveMusicListToJSON();
            }

        });
    }

    //done
    updateLyricPosition(time){
        if(this.dom.lyricul.children.length == 0) return;
        let curLyricLi = this.dom.lyricul.querySelector("li.curLyric");
        let nextLyricLi, nextTime, lastNextLyricLi, scrollDown = true;
        let scrollDownNext = (ccurLyricLi) => {return ccurLyricLi.nextSibling;};
        let scrollUpNext = (ccurLyricLi) => {return ccurLyricLi.previousSibling;};
        let scrollNext = scrollDownNext;
        if(curLyricLi){
            let currTime = parseFloat(curLyricLi.getAttribute("time"));
            scrollDown = currTime < time;
            if (!scrollDown)
                scrollNext = scrollUpNext;

            nextLyricLi = scrollNext(curLyricLi);
        }
        else{
            nextLyricLi = this.dom.lyricul.children[0];
        }

        while(nextLyricLi){
            nextTime = parseFloat(nextLyricLi.getAttribute("time"));
            if( (nextTime < time && scrollDown) || (nextTime > time && !scrollDown) ){
                lastNextLyricLi = nextLyricLi;
                nextLyricLi = scrollNext(nextLyricLi);
            }
            else{ break;}
        }

        if(!lastNextLyricLi)
            return;

        if(curLyricLi)
            curLyricLi.classList.remove("curLyric");

        if(!scrollDown && nextLyricLi)
            nextLyricLi.classList.add("curLyric");
        else
            lastNextLyricLi.classList.add("curLyric");

        let ulRect = this.dom.lyricul.getBoundingClientRect(),
            liRect = (!scrollDown && nextLyricLi)? nextLyricLi.getBoundingClientRect() : lastNextLyricLi.getBoundingClientRect(),
            offset = liRect.top - ulRect.top;

        if(offset - this.dom.lyricul.scrollTop + liRect.height/2  > this.dom.lyricblock.offsetHeight/2 || !scrollDown){
            let scrollAmount = offset + liRect.height/2 - this.dom.lyricblock.offsetHeight/2 - this.dom.lyricblock.scrollTop;
            scrollYWithDistance(this.dom.lyricblock, scrollAmount, 0.3);
        }
    }

    //done
    saveMusicListToJSON(){
        let json = {
            listType: "normal",
            source: this.musicList
        };
        let json_s = JSON.stringify(json);
        fs.writeFile('./music-list.json', json_s, 'utf8', (err) => {
            if(err)
                console.log(err);
            else
                console.log("write to local music list success");
        });
    }

    //done
    togglePlaybackRateBar(){
        this.dom.playbackratediv.classList.toggle("skPlayer-rate-div-show");
    }

    //done
    changePlaybackRate(){
        let temp = parseInt(this.dom.playbackratebar.value);
        let rate;
        switch(temp){
            case 1:
                rate = 0.50;
                break;
            case 2:
                rate = 0.75;
                break;
            case 3:
                rate = 1.00;
                break;
            case 4:
                rate = 1.5;
                break;
            case 5:
                rate = 2.00;
                break;
        }
        this.dom.playbackratedisplay.innerHTML = "X<br />"+rate;
        this.audio.playbackRate = rate;
    }

    //done
    toggleVideoDisplay(){
        this.root.classList.toggle("video-on");
    }

    //done
    browseVideoFile(){
        console.log("browse video file");
        let currentPlayingMusicLi;
        if( (currentPlayingMusicLi = this.dom.musiclist.querySelector('.skPlayer-curMusic')) ){
            let index = this.getElementIndex(currentPlayingMusicLi);
            console.log(index);
            dialog.showOpenDialog({
                filters:[{name: 'Video', extensions: ['mp4']}],
                properties:['openFile']
                }, (filePaths) => {
                    if(filePaths)
                        this.displayVideoFromFile(filePaths[0], index);
                });
        }
    }

    //done
    displayVideoFromFile(filePath,index){
        console.log(filePath);
        if (!filePath) return;
        this.dom.videoplayer.children[0].setAttribute("src",filePath);
        // let videoSourceTag = document.createElement("source");
        // videoSourceTag.setAttribute("src",filePath);
        // videoSourceTag.setAttribute("type","video/mp4");
        // this.dom.videoplayer.appendChild(videoSourceTag);
        if(!this.root.classList.contains("skPlayer-video-in")){
            this.root.classList.add("skPlayer-video-in");
        }
        this.dom.videoplayer.load();
        if(this.musicList[index].video != filePath){
            this.musicList[index].video = filePath;
            this.saveMusicListToJSON();
        }
    }
}

const updateMusicList = () => {
    if(socket_connected)
        socket.emit('updateClientList', player.musicList);
}

module.exports = skPlayer;

ipcRenderer.on('ip:set', function(e, ip){
    socket_connected = true;
    url = "http://"+ip+":8080";
    socket = io(url);
    console.log(ip);

    socket.on("build", function(data){
        if(data == "success"){
            updateMusicList();
        }
    });
    socket.on("requestMusicFile", function(data){
        console.log("accept request from server and the requestor is " + data.requestor_id);
        //accept request from server
        let name = data.musicInfo.name;
        let author = data.musicInfo.author;
        let stream = ss.createStream();
        let filePath = "";
        for (let i in player.musicList){
            if (name == player.musicList[i].name && author == player.musicList[i].author)
            {
                filePath = player.musicList[i].path;
                break;
            }
        }
        // console.log(filePath);
        ss(socket).emit('musicFile', stream, {
            requestor_id: data.requestor_id,
            musicInfo: data.musicInfo,
            filename: 'temp'+Math.floor(Math.random()*10000)+'.'+filePath.split('.').pop()
        });
        fs.createReadStream(filePath).pipe(stream);
    });
    ss(socket).on('musicFile', function(stream, data){
        console.log("received file");
        let name = data.musicInfo.name;
        let author = data.musicInfo.author;
        let filename = data.filename;
        let dir = './temp';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }
        let filePath = dir + '/'+ filename;
        stream.pipe(fs.createWriteStream(filePath));
        console.log("write file " + filePath);
        //set the item in the playlist to local
        let j = 0;
        for (let i in player.musicList){
            if (name == player.musicList[i].name && author == player.musicList[i].author)
            {
                player.musicList[i].path = filePath;
                player.musicList[i].type = "local";
                j = i;
                break;
            }
        }

        //then play it
        player.saveMusicListToJSON();
        // player.switchMusic(Number(j));
        setTimeout(()=>{
            console.log("after 1 sec");
            console.log(filePath);
            player.audio.setAttribute("src",filePath);
            player.play();
        },1000);



    });
    socket.on("newMusicList", function(musicList){

        for(let i in musicList){
            // check existence
            let exist = false;
            for (let j in player.musicList)
            {
                if (musicList[i].name == player.musicList[j].name && musicList[i].author == player.musicList[j].author){
                    exist = true;
                }
            }
            if (!exist){
                //type,path,title,artist,cover
                player.addMusicToList('P2P','none',musicList[i].name,musicList[i].author,default_cover_path);

            }
        }
    });
    socket.on("deleteMusicItem", function(data){
        let name = data.name;
        let author = data.author;
        for (let i in player.musicList){
            if (name == player.musicList[i].name && author == player.musicList[i].author)
            {
                player.removeFromList(player.musiclist.children[i]);
            }
        }

    });
    socket.on("csci3280_error", function(err){
        console.log(err);
        //remove the block
    });
});
