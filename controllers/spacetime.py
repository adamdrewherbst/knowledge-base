# -------------------------------------------------------------------------
# - index is the default action of any application
# - user is required for authentication and authorization
# - download is for downloading files uploaded in the db (does streaming)
# -------------------------------------------------------------------------

def index():

    import os
    import gluon.fileutils
    import re

    section = 'abstract'
    if 'section' in request.vars:
        section = request.vars['section']

    language = 'english'
    if 'language' in request.vars:
        language = request.vars['language']

    translateLanguage = 'english'
    if language == 'english':
        translateLanguage = 'español'

    request.vars.update({'language': translateLanguage})
    translateURL = URL(args = request.args, vars = request.vars, host=True)

    contentDir = 'views/spacetime/sections/'
    if language != 'english':
        contentDir += language + '/'
    contentDir = os.path.join(request.folder, contentDir)
    sectionFile = os.path.join(contentDir, section+'.html')

    toc = gluon.fileutils.readlines_file(os.path.join(contentDir, 'table_of_contents.txt'))
    sections = {'sections': []}
    curren_section = sections
    last = None
    prevSection = None
    nextSection = None
    for line in toc:
        if line[-2:] == '??':
            continue
        arr = line.lstrip('+').split(',')
        if arr[0] == 'toc':
            tableOfContentsTitle = arr[1]
            continue
        info = {'file': arr[0], 'title': arr[1], 'sections': []}
        if line[0] == '+':
            current_section['sections'].append(info)
        else:
            sections['sections'].append(info)
            current_section = sections['sections'][-1]
        if last and info['file'] == section:
            prevSection = last
        elif last and last['file'] == section:
            nextSection = info
        if info['file']:
            last = info


    ref = gluon.fileutils.readlines_file(os.path.join(contentDir, 'references.bib'))
    references = {}
    currentReference = None
    for line in ref:
        m = re.search('@(.+)\{(.+),', line)
        if m:
            references[m.group(2)] = {'type': m.group(1)}
            currentReference = references[m.group(2)]
        elif currentReference is not None:
            m = re.search('\s*(.+)\s*=\s*\{(.+)\}', line)
            if m:
                currentReference[m.group(1)] = m.group(2)

        if line.strip() == '}':
            authors = currentReference['author'].split(' and ')
            currentReference['authors'] = []
            for author in authors:
                names = author.split(', ')
                currentReference['authors'].append({'first': names[1], 'last': names[0]})

            inline = ''
            if len(authors) == 0:
                inline = currentReference['title']
            if len(authors) == 1:
                inline = currentReference['authors'][0]['last']
            elif len(authors) == 2:
                inline = currentReference['authors'][0]['last'] + ' and ' + currentReference['authors'][1]['last']
            elif len(authors) > 2:
                inline = currentReference['authors'][0]['last'] + ' et al'

            if 'year' in currentReference:
                inline += ' ' + currentReference['year']

            currentReference['inline'] = inline

    return locals()


def equations():
    return locals()


def sendMail(form):
    import os
    import gluon.fileutils
    from gluon.tools import Mail

    miscFile = os.path.join(request.folder, 'static/spacetime/misc.txt')
    lines = gluon.fileutils.readlines_file(miscFile)

    mail = Mail()
    mail.settings.server = 'smtp.gmail.com:587'
    mail.settings.sender = lines[0]
    mail.settings.login = lines[0] + ':' + lines[2]
    mail.send(to=[lines[1]],
          subject='Message from ' + form.vars.email + ' via adamdrewherbst.pythonanywhere.com',
          reply_to=form.vars.email,
          message=form.vars.message)



def contact():

    translateURL = URL('spacetime', 'contact')
    translateLanguage = 'english'

    form=FORM(
            DIV('Contact Form', _class='form-title'),
            DIV(LABEL('Name'), INPUT(_name='name', requires=IS_NOT_EMPTY()), _class='form-group'),
            DIV(LABEL('E-mail'), INPUT(_name='email', requires=IS_EMAIL()), _class='form-group'),
            DIV(LABEL('Message'), TEXTAREA(_name='message', requires=IS_NOT_EMPTY()), _class='form-group'),
            INPUT(_type='submit', _class='send-button'),
            _class='contact-form')
    if form.process(onvalidation = sendMail).accepted:
        response.flash = 'form accepted'
    elif form.errors:
        response.flash = 'form has errors'
    else:
        response.flash = 'please fill the form'

    return locals()


def user():
    """
    exposes:
    http://..../[app]/default/user/login
    http://..../[app]/default/user/logout
    http://..../[app]/default/user/register
    http://..../[app]/default/user/profile
    http://..../[app]/default/user/retrieve_password
    http://..../[app]/default/user/change_password
    http://..../[app]/default/user/bulk_register
    use @auth.requires_login()
        @auth.requires_membership('group name')
        @auth.requires_permission('read','table name',record_id)
    to decorate functions that need access control
    also notice there is http://..../[app]/appadmin/manage/auth to allow administrator to manage users
    """
    return dict(form=auth())


@cache.action()
def download():
    """
    allows downloading of uploaded files
    http://..../[app]/default/download/[filename]
    """
    return response.download(request, db)


def call():
    """
    exposes services. for example:
    http://..../[app]/default/call/jsonrpc
    decorate with @services.jsonrpc the functions to expose
    supports xml, json, xmlrpc, jsonrpc, amfrpc, rss, csv
    """
    return service()


