
// State variables
let currentViewMode = localStorage.getItem('viewMode') || 'list'; // 'list' or 'grid'
let currentSortBy = 'date_desc';
let currentDirectoryData = null;

function setViewMode(mode) {
    currentViewMode = mode;
    localStorage.setItem('viewMode', mode);

    document.getElementById('view-list-btn').classList.toggle('active', mode === 'list');
    document.getElementById('view-grid-btn').classList.toggle('active', mode === 'grid');

    const container = document.getElementById('directory-data');
    if (container) {
        container.className = `view-container ${mode}-view`;
    }

    if (currentDirectoryData) {
        renderDirectory();
    }
}

function handleSort(sortType) {
    currentSortBy = sortType;
    document.querySelector('.sort-btn').innerHTML = `Sort: ${getSortLabel(sortType)} <span class="sort-icon"></span>`;
    if (currentDirectoryData) {
        renderDirectory();
    }
}

function getSortLabel(type) {
    const labels = {
        'name_asc': 'Name (A-Z)',
        'name_desc': 'Name (Z-A)',
        'date_desc': 'Date (Newest)',
        'date_asc': 'Date (Oldest)',
        'size_desc': 'Size (Largest)',
        'size_asc': 'Size (Smallest)'
    };
    return labels[type] || 'Sort';
}

function showSkeleton() {
    const skeletonContainer = document.getElementById('skeleton-container');
    const dataContainer = document.getElementById('directory-data');

    if (!skeletonContainer || !dataContainer) return;

    dataContainer.style.display = 'none';
    skeletonContainer.style.display = 'flex';
    skeletonContainer.className = `view-container ${currentViewMode}-view`;

    let html = '';
    for(let i=0; i<8; i++) {
        if (currentViewMode === 'list') {
            html += `
            <div class="skeleton-list-item">
                <div class="list-item-name">
                    <div class="skeleton skeleton-icon"></div>
                    <div class="skeleton skeleton-text"></div>
                </div>
                <div class="list-item-meta">
                    <div class="skeleton skeleton-meta"></div>
                    <div class="skeleton skeleton-meta"></div>
                </div>
            </div>`;
        } else {
            html += `
            <div class="skeleton-grid-item">
                <div class="skeleton skeleton-grid-preview"></div>
                <div class="skeleton-grid-info">
                    <div class="skeleton skeleton-text" style="width: 80%"></div>
                    <div class="skeleton skeleton-meta" style="width: 40%"></div>
                </div>
            </div>`;
        }
    }
    skeletonContainer.innerHTML = html;
}

function hideSkeleton() {
    const skeletonContainer = document.getElementById('skeleton-container');
    const dataContainer = document.getElementById('directory-data');
    if (skeletonContainer) skeletonContainer.style.display = 'none';
    if (dataContainer) dataContainer.style.display = currentViewMode === 'grid' ? 'grid' : 'flex';
}

function showDirectory(data) {
    currentDirectoryData = data['contents'];
    hideSkeleton();
    renderDirectory();
}

function renderDirectory() {
    if (!currentDirectoryData) return;

    const container = document.getElementById('directory-data');
    const isTrash = getCurrentPath().startsWith('/trash');

    let entries = Object.entries(currentDirectoryData);
    let folders = entries.filter(([key, value]) => value.type === 'folder');
    let files = entries.filter(([key, value]) => value.type === 'file');

    // Sorting Logic
    const sortFn = (a, b) => {
        const itemA = a[1];
        const itemB = b[1];

        switch(currentSortBy) {
            case 'name_asc': return itemA.name.localeCompare(itemB.name);
            case 'name_desc': return itemB.name.localeCompare(itemA.name);
            case 'date_desc': return new Date(itemB.upload_date) - new Date(itemA.upload_date);
            case 'date_asc': return new Date(itemA.upload_date) - new Date(itemB.upload_date);
            case 'size_desc': return (itemB.size || 0) - (itemA.size || 0);
            case 'size_asc': return (itemA.size || 0) - (itemB.size || 0);
            default: return 0;
        }
    };

    folders.sort(sortFn);
    files.sort(sortFn);

    let html = '';

    const generateMoreOptions = (item) => {
        if (isTrash) {
            return `
            <div data-path="${item.path}" id="more-option-${item.id}" data-name="${item.name}" class="more-options">
                <input class="more-options-focus" readonly="readonly" style="height:0;width:0;border:none;position:absolute">
                <div id="restore-${item.id}" data-path="${item.path}"><img src="static/assets/load-icon.svg"> Restore</div>
                <hr>
                <div id="delete-${item.id}" data-path="${item.path}"><img src="static/assets/trash-icon.svg"> Delete</div>
            </div>`;
        } else {
            return `
            <div data-path="${item.path}" id="more-option-${item.id}" data-name="${item.name}" class="more-options">
                <input class="more-options-focus" readonly="readonly" style="height:0;width:0;border:none;position:absolute">
                <div id="rename-${item.id}"><img src="static/assets/pencil-icon.svg"> Rename</div>
                <hr>
                <div id="trash-${item.id}"><img src="static/assets/trash-icon.svg"> Trash</div>
                <hr>
                <div id="${item.type === 'folder' ? 'folder-share' : 'share'}-${item.id}"><img src="static/assets/share-icon.svg"> Share</div>
            </div>`;
        }
    };

    const renderItem = (item, isFolder) => {
        const sizeStr = isFolder ? '--' : convertBytes(item.size);
        const iconSrc = isFolder ? 'static/assets/folder-solid-icon.svg' : 'static/assets/file-icon.svg';
        const dateStr = item.upload_date ? new Date(item.upload_date).toLocaleDateString() : '';
        const itemClass = isFolder ? 'folder-tr' : 'file-tr';

        if (currentViewMode === 'list') {
            return `
            <div class="list-item ${itemClass}" data-path="${item.path}" data-id="${item.id}" data-name="${item.name}">
                <div class="list-item-name">
                    <img src="${iconSrc}">
                    <span>${item.name}</span>
                </div>
                <div class="list-item-meta">
                    <span class="list-item-size">${sizeStr}</span>
                    <span class="list-item-date">${dateStr}</span>
                    <a data-id="${item.id}" class="more-btn"><img src="static/assets/more-icon.svg" class="rotate-90"></a>
                </div>
                ${generateMoreOptions(item)}
            </div>`;
        } else {
            return `
            <div class="grid-item ${itemClass}" data-path="${item.path}" data-id="${item.id}" data-name="${item.name}">
                <div class="more-btn-container">
                    <a data-id="${item.id}" class="more-btn"><img src="static/assets/more-icon.svg" class="rotate-90"></a>
                </div>
                <div class="grid-item-preview">
                    <img src="${iconSrc}">
                </div>
                <div class="grid-item-info">
                    <div class="grid-item-name">${item.name}</div>
                    <div class="grid-item-meta">
                        <span>${dateStr}</span>
                        <span>${sizeStr !== '--' ? sizeStr : ''}</span>
                    </div>
                </div>
                ${generateMoreOptions(item)}
            </div>`;
        }
    };

    for (const [key, item] of folders) {
        html += renderItem(item, true);
    }

    for (const [key, item] of files) {
        html += renderItem(item, false);
    }

    container.innerHTML = html;

    // Attach events
    if (!isTrash) {
        document.querySelectorAll('.folder-tr').forEach(div => {
            div.ondblclick = openFolder;
            // Also allow single click for mobile
            div.onclick = function(e) { if(e.target.closest('.more-btn')) return; openFolder.call(this); };
        });
        document.querySelectorAll('.file-tr').forEach(div => {
            div.ondblclick = openFile;
            div.onclick = function(e) { if(e.target.closest('.more-btn')) return; openFile.call(this); };
        });
    }

    document.querySelectorAll('.more-btn').forEach(div => {
        div.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            openMoreButton(div);
        });
    });
}
);
}

document.getElementById('search-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = document.getElementById('file-search').value;
    console.log(query)
    if (query === '') {
        alert('Search field is empty');
        return;
    }
    const path = '/?path=/search_' + encodeURI(query);
    console.log(path)
    window.location = path;
});

// Loading Main Page

document.addEventListener('DOMContentLoaded', function () {

    // Initialize view mode and buttons
    setViewMode(currentViewMode);
    document.querySelector('.sort-btn').innerHTML = `Sort: ${getSortLabel(currentSortBy)} <span class="sort-icon"></span>`;

    document.getElementById('view-list-btn').addEventListener('click', () => setViewMode('list'));
    document.getElementById('view-grid-btn').addEventListener('click', () => setViewMode('grid'));

    const inputs = ['new-folder-name', 'rename-name', 'file-search']
    for (let i = 0; i < inputs.length; i++) {
        document.getElementById(inputs[i]).addEventListener('input', validateInput);
    }

    if (getCurrentPath().includes('/share_')) {
        getCurrentDirectory()
    } else {
        if (getPassword() === null) {
            document.getElementById('bg-blur').style.zIndex = '2';
            document.getElementById('bg-blur').style.opacity = '0.1';

            document.getElementById('get-password').style.zIndex = '3';
            document.getElementById('get-password').style.opacity = '1';
        } else {
            getCurrentDirectory()
        }
    }

    // Theme Toggle Logic
    const themeBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = document.getElementById('theme-icon');
    const body = document.body;

    // Check local storage
    if (localStorage.getItem('theme') === 'dark') {
        body.classList.add('dark-mode');
        updateIcon(true);
    }

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            body.classList.toggle('dark-mode');
            const isDark = body.classList.contains('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            updateIcon(isDark);
        });
    }

    function updateIcon(isDark) {
        if (!themeIcon) return;
        if (isDark) {
            // Sun Icon (Material Design Wb_sunny 24px)
            themeIcon.setAttribute("viewBox", "0 0 24 24");
            themeIcon.innerHTML = '<path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/>';
        } else {
            // Moon Icon (Original 24px)
            themeIcon.setAttribute("viewBox", "0 0 24 24");
            themeIcon.innerHTML = '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>';
        }
    }


    // Sidebar Toggle Logic
    const sidebarBtn = document.getElementById('sidebar-toggle-btn');
    const container = document.querySelector('.container');

    // Check local storage for sidebar state
    if (localStorage.getItem('sidebar') === 'collapsed') {
        container.classList.add('sidebar-collapsed');
    }

    if (sidebarBtn) {
        sidebarBtn.addEventListener('click', () => {
            container.classList.toggle('sidebar-collapsed');
            const isCollapsed = container.classList.contains('sidebar-collapsed');
            localStorage.setItem('sidebar', isCollapsed ? 'collapsed' : 'expanded');
        });
    }
});