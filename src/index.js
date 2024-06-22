const { XMLParser } = require('fast-xml-parser');

addEventListener('fetch', (event) => {
	event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
	const url = new URL(request.url);
	const pathname = url.pathname;

	const webdavUrl = `${HOST}`;
	const username = `${USERNAME}`;
	const password = `${PASSWORD}`;
	if (pathname === '/list') {
		return listFiles(webdavUrl, username, password);
	} else if (pathname.startsWith('/download')) {
		const filePath = pathname.replace('/download', '');
		return downloadFile(request, webdavUrl, username, password, filePath);
	} else {
		return new Response('Not found', { status: 404 });
	}
}

async function listFiles(webdavUrl, username, password) {
	const response = await fetch(webdavUrl, {
		method: 'PROPFIND',
		headers: {
			Authorization: 'Basic ' + btoa(`${username}:${password} `),
			Depth: '1',
		},
	});
	if (!response.ok) {
		return new Response('Failed to list files', { status: response.status });
	}

	const text = await response.text();
	const files = parseWebDAVResponse(text);
	return new Response(generateHTML(files), {
		headers: { 'Content-Type': 'text/html' },
	});
}

function parseWebDAVResponse(xml) {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: '@_',
	});
	const jsonObj = parser.parse(xml);
	const files = [];

	if (jsonObj['D:multistatus'] && jsonObj['D:multistatus']['D:response']) {
		const responses = Array.isArray(jsonObj['D:multistatus']['D:response'])
			? jsonObj['D:multistatus']['D:response']
			: [jsonObj['D:multistatus']['D:response']];

		for (const response of responses) {
			const href = response['D:href'];
			if (href) {
				files.push({
					href,
					creationDate: response['D:propstat']['D:prop']['lp1:creationdate'],
					lastModified: response['D:propstat']['D:prop']['lp1:getlastmodified'],
					contentLength: response['D:propstat']['D:prop']['lp1:getcontentlength'],
					contentType: response['D:propstat']['D:prop']['D:getcontenttype'] || response['D:propstat']['D:prop']['lp1:getcontenttype'],
				});
			}
		}
	}

	return files;
}

async function downloadFile(request, webdavUrl, username, password, filePath) {
	const range = request.headers.get('Range');

	const headers = {
		Authorization: 'Basic ' + btoa(`${username}:${password} `),
	};

	if (range) {
		headers['Range'] = range;
	}

	const response = await fetch(`${webdavUrl}${filePath} `, { headers });

	if (!response.ok && response.status !== 206) {
		// 206 is partial content
		return new Response('Failed to download file', { status: response.status });
	}

	const responseHeaders = new Headers(response.headers);
	responseHeaders.set('Content-Disposition', `attachment; filename = "${decodeURIComponent(filePath.split('/').pop())}"`);

	return new Response(response.body, {
		headers: responseHeaders,
		status: response.status,
	});
}

function generateHTML(files) {
	const rows = files
		.map((file) => {
			return `
	< tr class="border-t border-gray-700" >
        <td class="px-4 py-2"><a href="/download${file.href}" class="text-blue-400 hover:text-blue-600">${file.href.split('/').pop()}</a></td>
        <td class="px-4 py-2">${file.lastModified}</td>
        <td class="px-4 py-2">${formatSize(file.contentLength)}</td>
        <td class="px-4 py-2">
          <a href="/download${file.href}" class="text-blue-400 hover:text-blue-600">
            <svg class="w-6 h-6 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12v1m0 8v1m0-2h16m0 2v-1m0-8v-1m0 4H4m16 4V8m0-4H4v4m0 0h16M8 4v12h8V4H8z"></path>
            </svg>
          </a>
        </td>
      </tr >
	`;
		})
		.join('');

	return `
	< !DOCTYPE html >
		<html lang="en">
			<head>
				<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
						<title>File List</title>
						<link href="https://unpkg.com/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
							<style>
								body {
									background - color: #1a202c;
								color: #a0aec0;
        }
								th {
									background - color: #2d3748;
								color: #cbd5e0;
        }
								tr:nth-child(even) {
									background - color: #2d3748;
        }
								tr:hover {
									background - color: #4a5568;
        }
							</style>
						</head>
						<body class="font-sans leading-normal tracking-normal">
							<div class="container mx-auto p-4">
								<h1 class="text-2xl font-bold mb-4 text-white">File List</h1>
								<table class="min-w-full bg-gray-900 rounded-lg shadow-lg">
									<thead>
										<tr>
											<th class="px-4 py-2">Name</th>
											<th class="px-4 py-2">Last Modified</th>
											<th class="px-4 py-2">Size</th>
											<th class="px-4 py-2">Actions</th>
										</tr>
									</thead>
									<tbody>
										${rows}
									</tbody>
								</table>
							</div>
						</body>
					</html>
					`;
}

function formatSize(bytes) {
	if (bytes === undefined) return '';
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
	if (bytes === 0) return '0 Byte';
	const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
	return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
}
