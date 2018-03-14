//SKPlayer
console.log('%cSKPlayer 3.0.8', 'color:#D94240');

//require('./src/skPlayer.scss'); //changed to use ./src/skPlayer.css

const electron = require('electron');
const {ipcRenderer} = electron;
const {dialog} = electron.remote;
const fs = require('fs');
const jsmediatags = require("jsmediatags");

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
		for(let property in this){
			if(typeof option[property] == typeof undefined || option[property] == null){
				console.log("Creation failed because of lacking "+property);
				return Object.create(null);
			}
			this[property] = option[property];
		}
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
        this.toggleMute = this.toggleMute.bind(this);
        this.switchMode = this.switchMode.bind(this);
		this.browseFile = this.browseFile.bind(this);
		this.clearList = this.clearList.bind(this);
		this.filesChosenCallback = this.filesChosenCallback.bind(this);

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
                </li>
            `
	}
	
	//render HTML
    template(){
        let html = `
            <audio class="skPlayer-source" src="" preload="auto"></audio>
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
                <div class="skPlayer-button skPlayer-list-switch">
                    <i class="skPlayer-list-icon"></i>
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
				<i class="skPlayer-button skPlayer-list-clear"></i>
				<i class="skPlayer-button skPlayer-list-add"></i>
			</div>
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
            switchbutton: this.root.querySelector('.skPlayer-list-switch'),
            modebutton: this.root.querySelector('.skPlayer-mode'),
			listclearbutton: this.root.querySelector('.skPlayer-list-clear'),
			listaddbutton: this.root.querySelector('.skPlayer-list-add'),
            musiclist: this.root.querySelector('.skPlayer-list')
        };
        
        if(this.option.listshow){
            this.root.className = 'skPlayer-list-on';
        }
        
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
        });
        this.audio.addEventListener('seeked', (e) => {
            this.play();
        });
        this.audio.addEventListener('ended', (e) => {
            this.next();
        });

        this.dom.playbutton.addEventListener('click', this.toggle);
        this.dom.switchbutton.addEventListener('click', this.toggleList);
        if(!this.isMobile){
            this.dom.volumebutton.addEventListener('click', this.toggleMute);
        }
		this.dom.listaddbutton.addEventListener('click', this.browseFile);
		this.dom.listclearbutton.addEventListener('click', this.clearList);
        this.dom.modebutton.addEventListener('click', this.switchMode);
        this.dom.musiclist.addEventListener('click', (e) => {
            let target,index,curIndex;
            if(e.target.tagName.toUpperCase() === 'LI'){
                target = e.target;
            }else if(e.target.parentElement.tagName.toUpperCase() === 'LI'){
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
        }
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
	clearList(){
		this.dom.musiclist.innerHTML = '';
		this.musicList = [];
		this.pause();
	}
	
	//done
	browseFile(){
		console.log("browse file");
		dialog.showOpenDialog({
			filters:[{name: 'Music', extensions: ['mp3','wav','wma','m4a']}],
			properties:['openFile','multiSelections']
			}, this.filesChosenCallback);
	}
	
	//done
	filesChosenCallback(filePaths){
		if(typeof filePaths == typeof undefined) return;
		for(let i in filePaths){
			this.addFileToList(filePaths[i]);
		}
	}
	
	
	addFileToList(filePath){
        jsmediatags.read(filePath,{
            onSuccess: (tags) => {
                console.log(tags);

                let music = new Music({
                    type: 'local',
                    name: tags.tags.title? tags.tags.title : 'unknown',
                    path: filePath,
                    author: tags.tags.artist? tags.tags.artist : 'unknown',
                    cover: default_cover_path
                });
                
                this.musicList.push(music);
                this.dom.musiclist.insertAdjacentHTML('beforeend', this.getLiHTML(this.musicList.length-1));

                if(this.musicList.length == 1){
                    this.audio.setAttribute("src",filePath);
                    this.switchMusic(0);
                }

                //should also update the music-list.json
            },
            onError: (error) => {
                console.log(error);
            }
        });
		
	}
	
	//done
	removeFromList(node){
		let nodeCurr = node;
		let nodeAfter;
		while ((nodeAfter = nodeCurr.nextSibling)){
			let indexNode = nodeAfter.querySelector('.skPlayer-list-index');
			indexNode.innerHTML = parseInt(indexNode.innerHTML) + 1;
			nodeCurr = nodeAfter;
		}
		this.musicList.splice(this.getElementIndex(node),1);
		this.dom.musiclist.removeChild(node);
		
		if(this.musicList.length == 0){
			this.pause();
		}
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
	
	
}


module.exports = skPlayer;